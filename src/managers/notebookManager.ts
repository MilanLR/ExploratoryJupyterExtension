import { JupyterFrontEnd } from '@jupyterlab/application';
import { NotebookPanel } from '@jupyterlab/notebook';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { UUID } from '@lumino/coreutils';
import { ICellModel } from '@jupyterlab/cells';
import {
  CollapsedManager,
  ICollapsedMetadata,
  IStoredNode
} from './collapsedManager';
import {
  cellModelToStoredNode,
  storedNodesToNotebookModel
} from '../cellUtils';
import { Signal } from '@lumino/signaling';
import { showDialog, Dialog } from '@jupyterlab/apputils';
import { Widget } from '@lumino/widgets';
import { AlternativeManager } from './alternativeManager';

interface INotebookInfo {
  sourceCell: ICellModel;
  sourceNotebook: NotebookPanel;
  tempNotebook: NotebookPanel;
  tempNotebookPath: string;
}

export class NotebookManager {
  private app: JupyterFrontEnd;
  private docManager: IDocumentManager;
  private tempNotebooks: Map<string, INotebookInfo> = new Map();
  private collapsedManager: CollapsedManager;
  private alternativeManager: AlternativeManager;
  public tempNotebookChanged = new Signal<NotebookManager, string>(this);
  public tempNotebookActivated = new Signal<NotebookManager, INotebookInfo>(
    this
  );

  constructor(
    app: JupyterFrontEnd,
    docManager: IDocumentManager,
    collapsedManager: CollapsedManager
  ) {
    this.app = app;
    this.docManager = docManager;
    this.collapsedManager = collapsedManager;
    this.alternativeManager = new AlternativeManager(() => {});
  }

  /**
   * Open a new notebook with the collapsed cells for editing
   */
  public async openTempNotebook(
    sourceCell: ICellModel,
    collapsedMetadata: ICollapsedMetadata,
    sourceNotebook: NotebookPanel
  ): Promise<{ panel: NotebookPanel; name: string } | null> {
    console.log('Opening temp notebook with collapsed data:', {
      cellId: sourceCell.id,
      storedNodesCount: collapsedMetadata.storedNodes.length,
      storedNodes: collapsedMetadata.storedNodes.map(n => ({
        id: n.cellId,
        hasAlternatives: !!n.alternativeMetadata,
        hasNestedNodes: n.nestedNodes && n.nestedNodes.length > 0
      }))
    });

    // first check if there is already a temp notebook for this source cell
    if (this.getTempNotebookForCell(sourceCell)) {
      console.log('Temp notebook already exists for this cell');
      this.setTempNotebookFront(sourceCell);
      return null;
    }

    // Check if there's a saved notebook name in the metadata
    let notebookName = collapsedMetadata.notebookName;
    console.log('Notebook name:', notebookName);
    let notebookExists = false;

    if (notebookName) {
      // Check if the notebook file exists
      try {
        await this.docManager.services.contents.get(notebookName);
        notebookExists = true;
        console.log(`Found existing notebook: ${notebookName}`);
      } catch (error) {
        console.log(
          `Notebook ${notebookName} not found, will create a new one`
        );
      }
    }

    // Create a temporary notebook model from the collapsed cells
    const tempModel = storedNodesToNotebookModel(collapsedMetadata.storedNodes);
    if (!tempModel) {
      console.error('Failed to create temporary notebook model');
      return null;
    }

    console.log(
      'Created temp notebook model with cells:',
      tempModel.cells.length
    );

    // If we don't have a notebook name or it doesn't exist, ask the user
    if (!notebookExists || !notebookName) {
      console.log("No notebook name or it doesn't exist");
      // Create a proper input widget for the dialog
      const input = document.createElement('input');
      input.placeholder = 'Enter notebook name';
      input.classList.add('jp-mod-styled');
      if (notebookName) {
        // Pre-fill with the previous name if it exists
        input.value = notebookName.replace('.ipynb', '');
      }
      const body = new Widget({ node: input });
      console.log('Showing dialog');

      // Ask the user for a notebook name
      const result = await showDialog({
        title: notebookName
          ? 'Notebook Not Found - Create New?'
          : 'Name Your Temporary Notebook',
        body: body,
        buttons: [Dialog.cancelButton(), Dialog.okButton()]
      });
      console.log('Dialog result:', result);

      if (!result.button.accept) {
        console.log('User cancelled notebook creation');
        return null; // User cancelled
      }

      // Use the input value directly from the input element
      notebookName = input.value
        ? `${input.value}.ipynb`
        : `temp-notebook-${UUID.uuid4()}.ipynb`;
    }
    console.log('Notebook name:', notebookName);

    // Update the collapsed metadata with the notebook name
    collapsedMetadata.notebookName = notebookName;
    console.log('Setting collapsed metadata with notebook name:', notebookName);
    this.collapsedManager.setCollapsedMetadata(sourceCell, collapsedMetadata);

    // Create and open the temp notebook
    const tempNotebook = this.docManager.createNew(
      notebookName,
      'notebook',
      sourceNotebook.sessionContext.kernelPreference
    ) as NotebookPanel;

    // Replace the model of the temp notebook with our created model
    tempNotebook.context.model.fromJSON(tempModel.toJSON());

    // Store information about this temp notebook
    this.tempNotebooks.set(notebookName, {
      sourceCell,
      sourceNotebook,
      tempNotebook,
      tempNotebookPath: notebookName
    });

    // Set up event listeners for saving/closing
    this.setupEventListeners(notebookName);

    // Set notebook title to indicate it's a temporary view
    tempNotebook.title.label = `Collapsed View: ${sourceNotebook.title.label}`;

    // Open the notebook in the main area
    this.app.shell.add(tempNotebook, 'main');

    return { panel: tempNotebook, name: notebookName };
  }

  /**
   * Save changes from the temp notebook back to the original notebook
   */
  public saveChanges(tempNotebookPath: string): void {
    const info = this.tempNotebooks.get(tempNotebookPath);
    if (!info) {
      console.error('Temp notebook not found:', tempNotebookPath);
      return;
    }

    const { sourceCell, tempNotebook } = info;

    // Convert the temp notebook cells to StoredNode format
    const storedNodes: IStoredNode[] = [];
    const cells = tempNotebook.content.model?.cells;

    if (cells) {
      for (let i = 0; i < cells.length; i++) {
        const cell = cells.get(i);
        storedNodes.push(cellModelToStoredNode(cell));
      }
    }

    // Save the collapsed metadata
    this.collapsedManager.setCollapsedMetadata(sourceCell, {
      storedNodes,
      notebookName: tempNotebookPath
    });

    // Update the source cell with the combined source
    this.collapsedManager.updateCellSource(sourceCell);

    // Also update the active alternative with the combined source
    const combinedSource = sourceCell.sharedModel.getSource();
    this.alternativeManager.updateCurrentVersion(sourceCell, combinedSource);

    console.log(
      'Saved changes from temp notebook to original cell and updated alternatives'
    );

    // Emit the change signal to update the graph
    this.tempNotebookChanged.emit(tempNotebookPath);
  }

  /**
   * Close the temporary notebook
   */
  public closeNotebook(
    notebook: NotebookPanel,
    saveChanges: boolean = true
  ): void {
    const tempNotebookPath = notebook.context.path;
    const info = this.tempNotebooks.get(tempNotebookPath);
    if (!info) {
      return;
    }

    if (saveChanges) {
      this.saveChanges(tempNotebookPath);
    }

    // Close the notebook
    info.tempNotebook.close();
  }

  /**
   * Close all temporary notebooks related to a source notebook
   */
  public closeAllForNotebook(sourceNotebook: NotebookPanel): void {
    for (const [, info] of this.tempNotebooks.entries()) {
      if (info.sourceNotebook === sourceNotebook) {
        this.closeNotebook(info.tempNotebook);
      }
    }
  }

  /**
   * Set up event listeners for a temporary notebook
   */
  private setupEventListeners(tempNotebookPath: string): void {
    const info = this.tempNotebooks.get(tempNotebookPath);
    if (!info) {
      return;
    }

    const { tempNotebook } = info;

    // Save changes when the notebook is saved
    tempNotebook.context.saveState.connect((_, state) => {
      if (state === 'completed') {
        this.saveChanges(tempNotebookPath);
      }
    });

    // Override the close behavior to skip confirmation, but preserve data
    const originalClose = tempNotebook.close;
    tempNotebook.close = () => {
      // Save changes before modifying any state
      this.saveChanges(tempNotebookPath);

      // Skip the confirmation dialog by setting the dirty state to false temporarily
      const isDirty = tempNotebook.context.model.dirty;
      tempNotebook.context.model.dirty = false;

      // Call the original close method
      const result = originalClose.call(tempNotebook);

      // Restore the dirty state
      tempNotebook.context.model.dirty = isDirty;

      // Remove from our tracking
      this.tempNotebooks.delete(tempNotebookPath);

      return result;
    };

    // Save changes when the notebook is disposed
    tempNotebook.disposed.connect(() => {
      if (this.tempNotebooks.has(tempNotebookPath)) {
        this.saveChanges(tempNotebookPath);
        this.tempNotebooks.delete(tempNotebookPath);
      }
    });

    // Add real-time change tracking for cell content changes
    const model = tempNotebook.content.model;
    if (model) {
      // Listen for cell additions/removals
      model.contentChanged.connect((_, args) => {
        console.log('Cell change detected in temp notebook');
        this.saveChanges(tempNotebookPath);

        // Emit a signal that the graph widget can listen to
        this.tempNotebookChanged.emit(tempNotebookPath);
      });
    }

    // TODO Listen for notebook activation
  }

  /**
   * Get the temporary notebook associated with a source cell
   */
  public getTempNotebookForCell(sourceCell: ICellModel): NotebookPanel | null {
    for (const info of this.tempNotebooks.values()) {
      if (info.sourceCell === sourceCell) {
        return info.tempNotebook;
      }
    }
    return null;
  }

  /**
   * Put the temp notebook for a source cell in front.
   */
  public setTempNotebookFront(sourceCell: ICellModel): void {
    const tempNotebook = this.getTempNotebookForCell(sourceCell);
    if (tempNotebook) {
      this.app.shell.activateById(tempNotebook.id);
    }
  }

  /**
   * Check if a notebook is a temporary notebook
   */
  public isTempNotebook(notebook: NotebookPanel): boolean {
    const path = notebook.context.path;
    return this.tempNotebooks.has(path);
  }

  /**
   * Get the source information for a temporary notebook
   */
  public getSourceInfo(tempNotebookPath: string): INotebookInfo | undefined {
    return this.tempNotebooks.get(tempNotebookPath);
  }

  /**
   * Open a new notebook from a stored node
   */
  public async openTempNotebookFromStoredNode(
    storedNode: IStoredNode,
    collapsedMetadata: ICollapsedMetadata,
    sourceNotebook: NotebookPanel,
    parentCell: ICellModel
  ): Promise<{ panel: NotebookPanel; name: string } | null> {
    console.log('Opening temp notebook from stored node:', {
      cellId: storedNode.cellId,
      storedNodesCount: collapsedMetadata.storedNodes.length
    });

    // Create a temporary notebook model from the collapsed cells
    const tempModel = storedNodesToNotebookModel(collapsedMetadata.storedNodes);
    if (!tempModel) {
      console.error('Failed to create temporary notebook model');
      return null;
    }

    // Create a proper input widget for the dialog
    const input = document.createElement('input');
    input.placeholder = 'Enter notebook name';
    input.classList.add('jp-mod-styled');
    const body = new Widget({ node: input });

    // Ask the user for a notebook name
    const result = await showDialog({
      title: 'Name Your Nested Notebook',
      body: body,
      buttons: [Dialog.cancelButton(), Dialog.okButton()]
    });

    if (!result.button.accept) {
      return null; // User cancelled
    }

    // Use the input value directly from the input element
    const notebookName = input.value
      ? `${input.value}.ipynb`
      : `nested-notebook-${UUID.uuid4()}.ipynb`;

    // Create and open the temp notebook
    const tempNotebook = this.docManager.createNew(
      notebookName,
      'notebook',
      sourceNotebook.sessionContext.kernelPreference
    ) as NotebookPanel;

    // Replace the model of the temp notebook with our created model
    tempNotebook.context.model.fromJSON(tempModel.toJSON());

    // Store information about this temp notebook
    this.tempNotebooks.set(notebookName, {
      sourceCell: parentCell, // Use the parent cell for saving changes back
      sourceNotebook,
      tempNotebook,
      tempNotebookPath: notebookName
    });

    // Set up event listeners for saving/closing
    this.setupEventListeners(notebookName);

    // Set notebook title to indicate it's a temporary view
    tempNotebook.title.label = `Nested View: ${sourceNotebook.title.label}`;

    // Open the notebook in the main area
    this.app.shell.add(tempNotebook, 'main');

    return { panel: tempNotebook, name: notebookName };
  }
}
