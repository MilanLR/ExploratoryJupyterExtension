import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
  ILayoutRestorer
} from '@jupyterlab/application';
import { ICommandPalette, WidgetTracker } from '@jupyterlab/apputils';
import { INotebookTracker } from '@jupyterlab/notebook';
import { GraphWidget, NotebookData } from './graphs/graphWidget';
import '../style/base.css';
import { NotebookListener } from './services/notebookListener';

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
    // Initialize graph widget
    activateGraph(app, palette, restorer, tracker);

    console.log('Extension activated!');
  }
};

const activateGraph = function (
  app: JupyterFrontEnd,
  palette: ICommandPalette,
  restorer: ILayoutRestorer,
  notebookTracker: INotebookTracker
) {
  let widget: GraphWidget;
  const command = 'graph-widget:open';

  // Add an application command
  app.commands.addCommand(command, {
    label: 'Show Graph Widget',
    execute: () => {
      if (!widget || widget.isDisposed) {
        // Create a new widget if one does not exist
        // or if the previous one was disposed
        widget = new GraphWidget();

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
          widget.updateNotebook(current.content.model.toJSON());
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
      command,
      name: () => 'graph-widget'
    });
  }

  // Add the command to the palette
  palette.addItem({ command, category: 'Tutorial' });

  // Execute the command once during initialization
  app.commands.execute(command);
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
      widget.updateNotebook(current.content.model.toJSON());

      // Listen for changes in the current notebook's content
      current.content.model.contentChanged.connect(() => {
        console.log(
          'Notebook content changed - cells modified, added, or deleted'
        );
        widget.updateNotebook(current.content.model?.toJSON());
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
      widget.updateNotebook(current.content.model.toJSON());
    }
  });
}

export default plugin;
