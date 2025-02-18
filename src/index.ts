import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
  ILayoutRestorer
} from '@jupyterlab/application';
import { ICommandPalette, WidgetTracker } from '@jupyterlab/apputils';
import { INotebookTracker } from '@jupyterlab/notebook';
import { GraphWidget } from './graphs/graphWidget';
import '../style/base.css';
import {
  addIcon,
  caretLeftIcon,
  caretRightIcon,
  deleteIcon,
  LabIcon
} from '@jupyterlab/ui-components';
import { AlternativeManager } from './alternatives/alternativeManager';
import graphIconStr from '../style/icons/graph.svg';
import { CollapsedManager } from './collapsed/collapsedManager';
import { NotebookPanel } from '@jupyterlab/notebook';

const graphIcon = new LabIcon({
  name: 'ui-components:graph',
  svgstr: graphIconStr
});

const CommandIds = {
  add: 'alternative-command-add',
  left: 'alternative-command-left',
  right: 'alternative-command-right',
  delete: 'alternative-command-delete',
  open: 'graph-widget:open',
  expand: 'collapsed-command-expand',
  collapse: 'collapsed-command-collapse'
};

/**
 * Initialization data for the ExploratoryJupyterExtension extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'ExploratoryJupyterExtension:plugin',
  description:
    'A JupyterLab extension to give better support for exploratory programming.',
  autoStart: true,
  requires: [ICommandPalette, INotebookTracker],
  optional: [ILayoutRestorer],
  activate: (
    app: JupyterFrontEnd,
    palette: ICommandPalette,
    tracker: INotebookTracker,
    restorer: ILayoutRestorer
  ) => {
    // Initialize the alternative manager
    const alternativeManager = new AlternativeManager(() => {
      // Refresh button states
      Object.values(CommandIds).forEach(id => {
        app.commands.notifyCommandChanged(id);
      });
    });

    const collapsedManager = new CollapsedManager(
      () => tracker.currentWidget,
      app.commands
    );

    // Initialize graph widget
    // Initialize graph widget
    activateGraph(
      app,
      palette,
      restorer,
      tracker,
      alternativeManager,
      collapsedManager
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
        const cell = tracker.activeCell;
        if (cell) {
          return collapsedManager.isCollapsed(cell.model);
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
          console.log('Selected cells:', selectedCells);
          return selectedCells.length > 1;
        }
        return false;
      },
      label: 'Collapse Selected Cells'
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

    console.log('Extension activated!');
  }
};

const activateGraph = function (
  app: JupyterFrontEnd,
  palette: ICommandPalette,
  restorer: ILayoutRestorer,
  notebookTracker: INotebookTracker,
  alternativeManager: AlternativeManager,
  collapsedManager: CollapsedManager
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
        widget = new GraphWidget(alternativeManager, collapsedManager);

        // Add the widget to the left area
        app.shell.add(widget, 'left', {
          rank: 900
        });

        // Track the widget for restoration
        widgetTracker.add(widget);

        // Initial check for open notebook
        const current = notebookTracker.currentWidget;
        if (current && current.content.model) {
          console.log('Initial notebook loaded');
          widget.updateNotebook(current.content.model);
        } else {
          widget.clearNotebook();
        }

        // Set up notebook change listeners
        setupNotebookListeners(widget, notebookTracker);
      }
      widget.show();
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
  notebookTracker: INotebookTracker
) {
  // Listen for notebook changes
  notebookTracker.currentChanged.connect(() => {
    const current = notebookTracker.currentWidget;

    if (current && current.content.model) {
      console.log('Switched to different notebook');
      widget.updateNotebook(current.content.model);

      // Listen for changes in the current notebook's content
      current.content.model.contentChanged.connect(() => {
        console.log(
          'Notebook content changed - cells modified, added, or deleted'
        );
        widget.updateNotebook(current.content.model);
      });
    } else {
      console.log('No notebook open, clearing widget');
      widget.clearNotebook();
    }
  });

  // Listen for active cell changes
  notebookTracker.activeCellChanged.connect(() => {
    const current = notebookTracker.currentWidget;
    if (current && current.content.model) {
      console.log('Active cell changed - cursor moved to different cell');
      widget.updateNotebook(current.content.model);
    }
  });
}

export default plugin;
