import { NotebookPanel } from '@jupyterlab/notebook';
import { ICellModel } from '@jupyterlab/cells';

interface StoredNode {
  cellId: string;
  alternatives?: string[];
  activeVersion?: number;
  nestedNodes?: StoredNode[];
}

interface CollapsedMetadata {
  nestingLevel: number;
  storedNodes: StoredNode[];
}

export class CollapsedManager {
  private notebookPanel: NotebookPanel;

  constructor(notebookPanel: NotebookPanel) {
    this.notebookPanel = notebookPanel;
  }

  /**
   * Get the metadata for a collapsed cell
   */
  private getCollapsedMetadata(
    cell: ICellModel
  ): CollapsedMetadata | undefined {
    const loadedMetadata = cell.sharedModel.getMetadata('collapsed');
    if (loadedMetadata === undefined) {
      return {
        nestingLevel: 0,
        storedNodes: []
      };
    }
    const parsedMetadata = JSON.parse(loadedMetadata as string);
    return parsedMetadata as CollapsedMetadata;
  }

  /**
   * Set the metadata for a collapsed cell
   */
  private setCollapsedMetadata(
    cell: ICellModel,
    metadata: CollapsedMetadata
  ): void {
    cell.sharedModel.setMetadata('collapsed', JSON.stringify(metadata));
  }

  /**
   * Get the nesting level of a cell
   */
  private getNestingLevel(model: ICellModel): number {
    return this.getCollapsedMetadata(model)?.nestingLevel || 0;
  }

  /**
   * Collapse cells below the current cell
   */
  public collapse(cells: ICellModel[]): void {
    console.log('Collapsing cells:', cells);
  }

  /**
   * Expand previously collapsed cells
   */
  public expand(cell: ICellModel): void {
    console.log('Expanding cell:', cell);
  }

  /**
   * Check if a cell is collapsed
   */
  public isCollapsed(cell: ICellModel): boolean {
    const metadata = this.getCollapsedMetadata(cell);
    return metadata ? metadata?.nestingLevel > 0 : false;
  }

  /**
   * Get the number of cells collapsed under this cell
   */
  public getCollapsedCount(cell: ICellModel): number {
    const metadata = this.getCollapsedMetadata(cell);
    return metadata?.storedNodes?.length || 0;
  }
}
