import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
  ILayoutRestorer
} from '@jupyterlab/application';
import { ICommandPalette, WidgetTracker } from '@jupyterlab/apputils';
import { INotebookTracker } from '@jupyterlab/notebook';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { GraphWidget } from './graphs/graphWidget';
import '../style/base.css';
import {
  addIcon,
  caretLeftIcon,
  caretRightIcon,
  deleteIcon,
  graphIcon
} from './icons';
import { AlternativeManager } from './managers/alternativeManager';
import { CollapsedManager } from './managers/collapsedManager';
import { NotebookPanel } from '@jupyterlab/notebook';
import { KernelMessage } from '@jupyterlab/services';
import { kernelManager } from './managers/kernelManager';
import { setExecutionCount } from './cellUtils';
import { TempNotebookManager } from './managers/tempNotebookManager';

const CommandIds = {
  add: 'alternative-command-add',
  left: 'alternative-command-left',
  right: 'alternative-command-right',
  delete: 'alternative-command-delete',
  open: 'graph-widget:open',
  expand: 'collapsed-command-expand',
  collapse: 'collapsed-command-collapse',
  runTests: 'run-tests'
};

/**
 * Initialization data for the ExploratoryJupyterExtension extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'ExploratoryJupyterExtension:plugin',
  description:
    'A JupyterLab extension to give better support for exploratory programming.',
  autoStart: true,
  requires: [ICommandPalette, INotebookTracker, IDocumentManager],
  optional: [ILayoutRestorer],
  activate: (
    app: JupyterFrontEnd,
    palette: ICommandPalette,
    tracker: INotebookTracker,
    docManager: IDocumentManager,
    restorer: ILayoutRestorer
  ) => {
    // Add cleanup function at the start of activate
    const cleanupTempNotebooks = async () => {
      const contents = app.serviceManager.contents;
      const files = await contents.get('');
      for (const file of files.content) {
        if (
          file.name.match(
            /^temp-notebook-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.ipynb$/i
          )
        ) {
          await contents.delete(file.path);
        }
      }
    };

    // Clean up temp notebooks on startup
    cleanupTempNotebooks().catch(console.error);

    // Initialize the alternative manager
    const alternativeManager = new AlternativeManager(() => {
      // Refresh button states
      Object.values(CommandIds).forEach(id => {
        app.commands.notifyCommandChanged(id);
      });
    });

    const onIOPubMessage = (msg: KernelMessage.IIOPubMessage) => {
      console.log('IOPub:', msg);
      const content = msg.content as
        | { name: string; text: string }
        | { execution_state: string };

      if (
        msg.header.msg_type === 'stream' &&
        'name' in content &&
        content.name === 'stdout'
      ) {
        const notebookPanel = app.shell.currentWidget as NotebookPanel;
        if (!notebookPanel) {
          return;
        }

        const activeCell = notebookPanel.content.activeCell;
        if (!activeCell) {
          return;
        }

        const alternativeIndex = alternativeManager.getActiveIndex(
          activeCell.model
        );

        // Get the output text from the message
        const outputText = content.text;

        // Add the output to the active cell's model
        const outputModel = {
          output_type: 'execute_result',
          name: `stdout-${alternativeIndex}`,
          data: {
            'text/plain': outputText
          },
          execution_count: 'a' + alternativeIndex
        };

        if ('outputs' in activeCell.model) {
          (activeCell.model.outputs as any).add(outputModel);
        }
      }
    };

    // Set initial output to test kernel connection
    app.commands.addCommand(CommandIds.runTests, {
      label: 'Run tests',
      execute: () => {
        const notebookPanel = tracker.currentWidget;
        if (notebookPanel) {
          const kernel = notebookPanel.sessionContext.session?.kernel;
          if (kernel) {
            const a = kernel.requestExecute({
              code: `
_cell_states = {}
get_ipython()._cell_states = _cell_states
print("Kernel connection established")
print("Cell states:", _cell_states)`,
              silent: false,
              store_history: false
            });
            a.onReply = msg => {
              console.log('Reply:', msg);
            };
            a.onIOPub = onIOPubMessage;
          }
        }
      }
    });

    palette.addItem({ command: CommandIds.runTests, category: 'Tutorial' });

    const collapsedManager = new CollapsedManager(() => tracker.currentWidget);
    const tempNotebookManager = new TempNotebookManager(
      app,
      docManager,
      collapsedManager
    );

    // Initialize graph widget
    activateGraph(
      app,
      palette,
      restorer,
      tracker,
      alternativeManager,
      collapsedManager,
      tempNotebookManager
    );

    app.commands.addCommand(CommandIds.add, {
      icon: addIcon,
      iconClass: 'teal-icon',
      caption: 'Add alternative version',
      execute: () => {
        const cell = tracker.activeCell;
        if (!cell) return;

        const source = cell.model.sharedModel.getSource();

        alternativeManager.addAlternative(source, cell.model);
      },
      isVisible: () => tracker.activeCell?.model.type === 'code'
    });

    app.commands.addCommand(CommandIds.left, {
      icon: caretLeftIcon,
      iconClass: 'teal-icon',
      caption: () => {
        const cell = tracker.activeCell;
        if (!cell) return 'Move alternative version left';
        const versions = alternativeManager.getAlternatives(cell.model);
        const currentIndex = alternativeManager.getActiveIndex(cell.model);
        return versions.length > 1
          ? `Move left (Version ${currentIndex + 1}/${versions.length})`
          : 'Move alternative version left';
      },
      execute: () => {
        const cell = tracker.activeCell;
        if (!cell) return;

        alternativeManager.moveAlternative('left', cell.model);
      },
      isVisible: () => tracker.activeCell?.model.type === 'code',
      isEnabled: () => {
        const cell = tracker.activeCell;
        if (!cell) return false;
        const versions = alternativeManager.getAlternatives(cell.model);
        const currentIndex = alternativeManager.getActiveIndex(cell.model);
        return versions.length > 1 && currentIndex > 0;
      }
    });

    app.commands.addCommand(CommandIds.right, {
      icon: caretRightIcon,
      iconClass: 'teal-icon',
      caption: () => {
        const cell = tracker.activeCell;
        if (!cell) return 'Move alternative version right';
        const versions = alternativeManager.getAlternatives(cell.model);
        const currentIndex = alternativeManager.getActiveIndex(cell.model);
        return versions.length > 1
          ? `Move right (Version ${currentIndex + 1}/${versions.length})`
          : 'Move alternative version right';
      },
      execute: () => {
        const cell = tracker.activeCell;
        if (!cell) return;

        alternativeManager.moveAlternative('right', cell.model);
      },
      isVisible: () => tracker.activeCell?.model.type === 'code',
      isEnabled: () => {
        const cell = tracker.activeCell;
        if (!cell) return false;
        const versions = alternativeManager.getAlternatives(cell.model);
        const currentIndex = alternativeManager.getActiveIndex(cell.model);
        return versions.length > 1 && currentIndex < versions.length - 1;
      }
    });

    app.commands.addCommand(CommandIds.delete, {
      icon: deleteIcon,
      iconClass: 'teal-icon',
      caption: () => {
        const cell = tracker.activeCell;
        if (!cell) return 'Delete alternative version';
        const versions = alternativeManager.getAlternatives(cell.model);
        const currentIndex = alternativeManager.getActiveIndex(cell.model);
        return versions.length > 1
          ? `Delete version ${currentIndex + 1}/${versions.length}`
          : 'Delete alternative version';
      },
      execute: () => {
        const cell = tracker.activeCell;
        if (!cell) return;

        alternativeManager.deleteAlternative(cell.model);
      },
      isVisible: () => tracker.activeCell?.model.type === 'code',
      isEnabled: () => {
        const cell = tracker.activeCell;
        if (!cell) return false;
        const versions = alternativeManager.getAlternatives(cell.model);
        return versions.length > 1;
      }
    });

    app.commands.addCommand(CommandIds.expand, {
      execute: () => {
        const cell = tracker.activeCell;
        if (cell) {
          collapsedManager.expand(cell.model);
        }
      },
      isVisible: () => {
        const notebook = app.shell.currentWidget;
        if (notebook instanceof NotebookPanel) {
          const selectedCells = notebook.content.widgets.filter(cell =>
            notebook.content.isSelectedOrActive(cell)
          );
          if (selectedCells.length === 1) {
            const cell = tracker.activeCell;
            if (cell) {
              return collapsedManager.isCollapsed(cell.model);
            }
          }
        }
        return false;
      },
      label: 'Expand Collapsed Cells'
    });

    app.commands.addCommand(CommandIds.collapse, {
      execute: () => {
        const notebook = app.shell.currentWidget;
        if (notebook instanceof NotebookPanel) {
          const activeCell = notebook.content.activeCell;
          const selectedCells = notebook.content.widgets.filter(cell =>
            notebook.content.isSelectedOrActive(cell)
          );
          if (selectedCells.length > 1 && activeCell) {
            collapsedManager.collapse(
              selectedCells.map(cell => cell.model),
              activeCell.model
            );
          }
        }
      },
      isVisible: () => {
        const notebook = app.shell.currentWidget;
        if (notebook instanceof NotebookPanel) {
          const selectedCells = notebook.content.widgets.filter(cell =>
            notebook.content.isSelectedOrActive(cell)
          );
          return selectedCells.length > 1;
        }
        return false;
      },
      label: 'Collapse Selected Cells',
      className: 'teal-icon'
    });

    // Set up cell change tracking
    tracker.activeCellChanged.connect((_, cell) => {
      if (cell) {
        cell.model.contentChanged.connect(() => {
          alternativeManager.updateCurrentVersion(
            cell.model,
            cell.model.sharedModel.getSource()
          );
        });
      }
    });

    tracker.selectionChanged.connect((_, cells) => {
      app.commands.notifyCommandChanged(CommandIds.collapse);
      app.commands.notifyCommandChanged(CommandIds.expand);
    });

    // Add execution listener to maintain alternative version numbering
    tracker.currentChanged.connect((_, notebook) => {
      if (notebook) {
        notebook.context.sessionContext.kernelChanged.connect((_, changed) => {
          if (changed.newValue) {
            changed.newValue.iopubMessage.connect((_, msg) => {
              if (msg.header.msg_type === 'execute_input') {
                const cell = tracker.activeCell;
                if (cell && cell.model.type === 'code') {
                  const alternativeIndex = alternativeManager.getActiveIndex(
                    cell.model
                  );
                  // Use setTimeout to let Jupyter set its count first, then override
                  setTimeout(() => {
                    setExecutionCount(cell.model, `a${alternativeIndex}`);
                  }, 10);
                }
              }
            });
          }
        });
      }
    });

    // Add kernel manager initialization
    tracker.currentChanged.connect((_, notebook) => {
      if (notebook) {
        // kernelManager.setKernel(
        //   notebook.sessionContext.session?.kernel ?? null
        // );

        notebook.sessionContext.kernelChanged.connect((_, changed) => {
          kernelManager.setKernel(changed.newValue ?? null);
        });
      } else {
        kernelManager.setKernel(null);
      }
    });

    console.log('Extension activated!');
  }
};

const activateGraph = function (
  app: JupyterFrontEnd,
  palette: ICommandPalette,
  restorer: ILayoutRestorer,
  notebookTracker: INotebookTracker,
  alternativeManager: AlternativeManager,
  collapsedManager: CollapsedManager,
  tempNotebookManager: TempNotebookManager
) {
  let widget: GraphWidget;

  // Add an application command
  app.commands.addCommand(CommandIds.open, {
    label: 'Open Graph Widget',
    icon: graphIcon,
    execute: () => {
      if (!widget || widget.isDisposed) {
        // Create a new widget if one does not exist
        // or if the previous one was disposed
        widget = new GraphWidget(
          alternativeManager,
          collapsedManager,
          tempNotebookManager
        );

        // Add the widget to the left area
        app.shell.add(widget, 'left', {
          rank: 900
        });

        // Track the widget for restoration
        widgetTracker.add(widget);

        // Initial check for open notebook
        const current = notebookTracker.currentWidget;
        if (
          current &&
          current.content.model &&
          !tempNotebookManager.isTempNotebook(current)
        ) {
          console.log('Initial notebook loaded');
          widget.updateNotebook(current);
        } else {
          widget.clearNotebook();
        }

        // Set up notebook change listeners
        setupNotebookListeners(widget, notebookTracker, tempNotebookManager);
      }

      // Show the widget and activate it in the left panel
      widget.show();
      app.shell.activateById(widget.id);
    }
  });

  // Track widget instance for state restoration
  const widgetTracker = new WidgetTracker<GraphWidget>({
    namespace: 'graph-widget'
  });

  if (restorer) {
    // Register the widget with the layout restorer
    restorer.restore(widgetTracker, {
      command: CommandIds.open,
      name: () => 'graph-widget'
    });
  }

  // Add the command to the palette
  palette.addItem({ command: CommandIds.open, category: 'Tutorial' });

  app.commands.execute(CommandIds.open);
};

// Helper function to set up notebook listeners
function setupNotebookListeners(
  widget: GraphWidget,
  notebookTracker: INotebookTracker,
  tempNotebookManager: TempNotebookManager
) {
  // Listen for notebook changes
  notebookTracker.currentChanged.connect(() => {
    const current = notebookTracker.currentWidget;

    if (
      current &&
      current.content.model &&
      !tempNotebookManager.isTempNotebook(current)
    ) {
      console.log('Switched to different notebook');
      widget.updateNotebook(current);

      // Listen for changes in the current notebook's content
      current.content.model.contentChanged.connect(() => {
        console.log(
          'Notebook content changed - cells modified, added, or deleted'
        );
        widget.updateNotebook(current);
      });
    } else {
      console.log('No notebook open, clearing widget');
      widget.clearNotebook();
    }
  });
  // Listen for active cell changes
  notebookTracker.activeCellChanged.connect(() => {
    const current = notebookTracker.currentWidget;
    if (
      current &&
      current.content.model &&
      !tempNotebookManager.isTempNotebook(current)
    ) {
      console.log('Active cell changed - cursor moved to different cell');
      widget.updateNotebook(current);
    }
  });
}

export default plugin;
