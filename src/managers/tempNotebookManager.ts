import { JupyterFrontEnd } from '@jupyterlab/application';
import {
  NotebookPanel,
  INotebookModel,
  NotebookModel
} from '@jupyterlab/notebook';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { UUID } from '@lumino/coreutils';
import { ICellModel } from '@jupyterlab/cells';
import { CollapsedMetadata, StoredNode } from './collapsedManager';
import {
  cellModelToStoredNode,
  storedNodesToNotebookModel
} from '../cellUtils';

interface TempNotebookInfo {
  sourceCell: ICellModel;
  sourceNotebook: NotebookPanel;
  tempNotebook: NotebookPanel;
  tempNotebookPath: string;
}

export class TempNotebookManager {
  private app: JupyterFrontEnd;
  private docManager: IDocumentManager;
  private tempNotebooks: Map<string, TempNotebookInfo> = new Map();

  constructor(app: JupyterFrontEnd, docManager: IDocumentManager) {
    this.app = app;
    this.docManager = docManager;
  }

  /**
   * Open a new notebook with the collapsed cells for editing
   */
  public openTempNotebook(
    sourceCell: ICellModel,
    collapsedMetadata: CollapsedMetadata,
    sourceNotebook: NotebookPanel
  ): NotebookPanel | null {
    console.log('Opening temp notebook with collapsed data:', {
      cellId: sourceCell.id,
      storedNodesCount: collapsedMetadata.storedNodes.length,
      storedNodes: collapsedMetadata.storedNodes.map(n => ({
        id: n.cellId,
        hasAlternatives: !!n.alternativeMetadata,
        hasNestedNodes: n.nestedNodes && n.nestedNodes.length > 0
      }))
    });

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

    // Generate a unique path for the temp notebook
    const tempPath = `temp-notebook-${UUID.uuid4()}.ipynb`;

    // Create and open the temp notebook
    const tempNotebook = this.docManager.createNew(
      tempPath,
      'notebook',
      sourceNotebook.sessionContext.kernelPreference
    ) as NotebookPanel;

    // Replace the model of the temp notebook with our created model
    tempNotebook.context.model.fromJSON(tempModel.toJSON());

    // Store information about this temp notebook
    this.tempNotebooks.set(tempPath, {
      sourceCell,
      sourceNotebook,
      tempNotebook,
      tempNotebookPath: tempPath
    });

    // Set up event listeners for saving/closing
    this.setupEventListeners(tempPath);

    // Set notebook title to indicate it's a temporary view
    tempNotebook.title.label = `Collapsed View: ${sourceNotebook.title.label}`;

    // Open the notebook in the main area
    this.app.shell.add(tempNotebook, 'main');

    return tempNotebook;
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
    const storedNodes: StoredNode[] = [];
    const cells = tempNotebook.content.model?.cells;

    if (cells) {
      for (let i = 0; i < cells.length; i++) {
        const cell = cells.get(i);
        storedNodes.push(cellModelToStoredNode(cell));
      }
    }

    // Update the collapsed metadata in the source cell
    sourceCell.sharedModel.setMetadata(
      'collapsed-data',
      JSON.stringify({ storedNodes })
    );

    console.log('Saved changes from temp notebook to original cell');
  }

  /**
   * Close the temporary notebook
   */
  public closeNotebook(
    tempNotebookPath: string,
    saveChanges: boolean = true
  ): void {
    const info = this.tempNotebooks.get(tempNotebookPath);
    if (!info) return;

    if (saveChanges) {
      this.saveChanges(tempNotebookPath);
    }

    // Close the notebook
    info.tempNotebook.close();

    // Remove from our tracking
    this.tempNotebooks.delete(tempNotebookPath);
  }

  /**
   * Close all temporary notebooks related to a source notebook
   */
  public closeAllForNotebook(sourceNotebook: NotebookPanel): void {
    for (const [path, info] of this.tempNotebooks.entries()) {
      if (info.sourceNotebook === sourceNotebook) {
        this.closeNotebook(path);
      }
    }
  }

  /**
   * Set up event listeners for a temporary notebook
   */
  private setupEventListeners(tempNotebookPath: string): void {
    const info = this.tempNotebooks.get(tempNotebookPath);
    if (!info) return;

    const { tempNotebook } = info;

    // Save changes when the notebook is saved
    tempNotebook.context.saveState.connect((_, state) => {
      if (state === 'completed') {
        this.saveChanges(tempNotebookPath);
      }
    });

    // Save changes when the notebook is closed
    tempNotebook.disposed.connect(() => {
      if (this.tempNotebooks.has(tempNotebookPath)) {
        this.saveChanges(tempNotebookPath);
        this.tempNotebooks.delete(tempNotebookPath);
      }
    });
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
   * Check if a notebook is a temporary notebook
   */
  public isTempNotebook(notebook: NotebookPanel): boolean {
    const path = notebook.context.path;
    return this.tempNotebooks.has(path);
  }

  /**
   * Get the source information for a temporary notebook
   */
  public getSourceInfo(tempNotebookPath: string): TempNotebookInfo | undefined {
    return this.tempNotebooks.get(tempNotebookPath);
  }
}
