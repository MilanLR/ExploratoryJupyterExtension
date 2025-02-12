import { NotebookPanel } from '@jupyterlab/notebook';
import { ICellModel } from '@jupyterlab/cells';
import { CommandRegistry } from '@lumino/commands';
interface StoredNode {
  cellId: string;
  alternatives?: string[];
  activeVersion?: number;
  nestedNodes?: StoredNode[];
}

interface CollapsedMetadata {
  storedNodes: StoredNode[];
}

export class CollapsedManager {
  private notebookPanel: NotebookPanel;
  private commands: CommandRegistry;

  constructor(notebookPanel: NotebookPanel, commands: CommandRegistry) {
    this.notebookPanel = notebookPanel;
    this.commands = commands;
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
   * Collapse cells below the current cell
   * @param cells Array of cells to collapse
   * @param activeCell The cell that initiated the collapse (will be preserved)
   */
  public collapse(cells: ICellModel[], activeCell: ICellModel): void {
    console.log('Starting collapse operation with:', {
      totalCells: cells.length,
      activeCellId: activeCell.id
    });

    if (cells.length < 2) {
      console.log('Not enough cells to collapse');
      return;
    }

    // filter out cells that are not code cells
    const codeCells = cells.filter(cell => cell.type === 'code');
    console.log('Filtered code cells:', {
      totalCodeCells: codeCells.length,
      nonCodeCells: cells.length - codeCells.length
    });

    if (codeCells.length < 2) {
      console.log('Not enough code cells to collapse');
      return;
    }

    // Get all cells except the active cell
    const cellsToCollapse = codeCells.filter(cell => cell.id !== activeCell.id);
    console.log('Cells to collapse:', {
      count: cellsToCollapse.length,
      cellIds: cellsToCollapse.map(cell => cell.id)
    });

    if (cellsToCollapse.length === 0) {
      console.log('No cells to collapse after filtering active cell');
      return;
    }

    // Create list of nested nodes with their metadata
    const storedNodes: StoredNode[] = codeCells.map(cell => {
      // Get alternatives metadata if it exists
      const alternativesMetadata = cell.sharedModel.getMetadata('alternatives');
      let alternatives: string[] | undefined;
      let activeVersion: number | undefined;

      if (alternativesMetadata) {
        const parsed = JSON.parse(alternativesMetadata as string);
        alternatives = parsed.versions;
        activeVersion = parsed.activeVersion;
      }

      // Get any existing collapsed metadata
      const collapsedMetadata = this.getCollapsedMetadata(cell);

      const node = {
        cellId: cell.id,
        alternatives,
        activeVersion,
        nestedNodes: collapsedMetadata?.storedNodes
      };

      console.log('Created stored node:', {
        cellId: node.cellId,
        hasAlternatives: alternatives !== undefined,
        alternativesCount: alternatives?.length,
        activeVersion,
        hasNestedNodes: node.nestedNodes !== undefined,
        nestedNodesCount: node.nestedNodes?.length
      });

      return node;
    });

    // Combine source code of all cells being collapsed
    const combinedSource = codeCells
      .map(cell => cell.sharedModel.getSource())
      .join('\n\n');

    console.log('Combined source code length:', combinedSource.length);

    // Update the active cell's source to include collapsed cells
    const originalSource = activeCell.sharedModel.getSource();
    activeCell.sharedModel.setSource(combinedSource);

    console.log('Updated active cell source:', {
      originalLength: originalSource.length,
      addedLength: combinedSource.length,
      totalLength: combinedSource.length
    });

    // Update metadata of the active cell
    this.setCollapsedMetadata(activeCell, {
      storedNodes
    });

    console.log('Updated collapse metadata:', {
      activeCellId: activeCell.id,
      storedNodesCount: storedNodes.length
    });

    // Remove all cells except the active cell
    for (const cell of cellsToCollapse) {
      console.log('Removing cell:', cell.id);
      this.notebookPanel.model?.sharedModel.deleteCell(
        this.notebookPanel.model?.sharedModel.cells.findIndex(
          c => c.id === cell.id
        )
      );
    }

    console.log('Collapse operation completed:', {
      activeCell: activeCell.id,
      storedNodes: storedNodes.map(node => ({
        cellId: node.cellId,
        hasAlternatives: node.alternatives !== undefined,
        hasNestedNodes: node.nestedNodes !== undefined
      }))
    });
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
    return metadata ? metadata.storedNodes.length > 0 : false;
  }

  /**
   * Get the number of cells collapsed under this cell
   */
  public getCollapsedCount(cell: ICellModel): number {
    const metadata = this.getCollapsedMetadata(cell);
    return metadata?.storedNodes?.length || 0;
  }
}
