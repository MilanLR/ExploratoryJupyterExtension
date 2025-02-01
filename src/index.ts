import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin,
  ILayoutRestorer
} from '@jupyterlab/application';
import { ICommandPalette, WidgetTracker } from '@jupyterlab/apputils';
import { INotebookTracker } from '@jupyterlab/notebook';
import { GraphWidget } from './graphs/graphWidget';

interface APODResponse {
  copyright: string;
  date: string;
  explanation: string;
  media_type: 'video' | 'image';
  title: string;
  url: string;
}

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
    activateGraph(app, palette, restorer);
    console.log(
      'JupyterLab extension ExploratoryJupyterExtension is activated!'
    );
  }
};

const activateGraph = function (
  app: JupyterFrontEnd,
  palette: ICommandPalette,
  restorer: ILayoutRestorer
) {
  let widget: GraphWidget;
  widget = new GraphWidget();

  // Add the widget to the left area with an icon
  app.shell.add(widget, 'left', {
    rank: 900
  });

  const openGraphCommand = 'graph-widget:open';
  app.commands.addCommand(openGraphCommand, {
    label: 'Show Graph Widget',
    execute: () => {
      widget.show();
    }
  });

  // Add the command to the palette.
  palette.addItem({ command: openGraphCommand, category: 'Tutorial' });

  const widgetTracker = new WidgetTracker<GraphWidget>({
    namespace: 'graph-widget'
  });

  widgetTracker.add(widget);

  restorer.restore(widgetTracker, {
    command: 'graph-widget:open',
    name: () => 'graph-widget'
  });
};

export default plugin;
