import { INotebookTracker, NotebookPanel } from '@jupyterlab/notebook';
import { NotebookStore } from '../stores/notebookStore';

export class NotebookListener {
  constructor(notebookTracker: INotebookTracker) {
    this.setupListeners(notebookTracker);
  }

  private setupListeners(notebookTracker: INotebookTracker): void {
    // Listen for notebook changes
    notebookTracker.currentChanged.connect(() => {
      const current = notebookTracker.currentWidget;
      this.handleNotebookChange(current);
    });
  }

  private handleNotebookChange(notebook: NotebookPanel | null): void {
    console.log('Notebook changed:', notebook?.id);

    if (!notebook || !notebook.content.model) {
      console.log('No notebook or model, clearing store');
      NotebookStore.update(s => {
        s.activeNotebookId = undefined;
        s.activeNotebookContent = undefined;
        s.isNotebookOpen = false;
      });
      return;
    }

    // Set up content change listener
    notebook.content.model.contentChanged.connect(() => {
      console.log('Notebook content changed:', notebook.id);
      this.updateNotebookContent(notebook);
    });

    // Update store
    console.log('Updating store with notebook:', notebook.id);
    NotebookStore.update(s => {
      s.activeNotebookId = notebook.id;
      s.activeNotebookContent = notebook.content.model?.toJSON();
      s.isNotebookOpen = true;
    });
  }

  private updateNotebookContent(notebook: NotebookPanel): void {
    console.log('Updating notebook content:', notebook.id);
    NotebookStore.update(s => {
      s.activeNotebookContent = notebook.content.model?.toJSON();
    });
  }
}
