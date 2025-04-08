import { NotebookPanel } from '@jupyterlab/notebook';
import { ICellModel } from '@jupyterlab/cells';

export interface StoredNode {
  cellId: string;
  source: string;
  alternativeMetadata?: string;
  nestedNodes?: StoredNode[];
}

export interface CollapsedMetadata {
  storedNodes: StoredNode[];
  notebookName?: string;
}

export class CollapsedManager {
  private getNotebookPanel: () => NotebookPanel | null;

  constructor(getNotebookPanel: () => NotebookPanel | null) {
    this.getNotebookPanel = getNotebookPanel;
  }

  /**
   * Get the metadata for a collapsed cell
   */
  public getCollapsedMetadata(cell: ICellModel): CollapsedMetadata | undefined {
    const loadedMetadata = cell.sharedModel.getMetadata('collapsed-data');
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
  public setCollapsedMetadata(
    cell: ICellModel,
    metadata: CollapsedMetadata
  ): void {
    console.log('Setting collapsed metadata:', metadata);
    cell.sharedModel.setMetadata('collapsed-data', JSON.stringify(metadata));
  }

  public updateCellSource(cell: ICellModel): void {
    const metadata = this.getCollapsedMetadata(cell);
    if (!metadata) {
      return;
    }

    // Recursively get all source code from stored nodes
    const getAllSources = (nodes: StoredNode[]): string[] => {
      const sources: string[] = [];
      for (const node of nodes) {
        sources.push(node.source);
      }
      return sources;
    };

    const sources = getAllSources(metadata.storedNodes);
    const combinedSource = sources.join('\n\n');
    cell.sharedModel.setSource(combinedSource);
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

    const notebookPanel = this.getNotebookPanel();
    if (!notebookPanel) {
      console.log('No notebook panel found');
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
      const alternativesMetadata =
        cell.sharedModel.getMetadata('alternatives-data');

      // Get any existing collapsed metadata
      const collapsedMetadata = this.getCollapsedMetadata(cell);

      const node = {
        cellId: cell.id,
        source: cell.sharedModel.getSource(),
        alternativeMetadata:
          alternativesMetadata !== undefined
            ? (alternativesMetadata as string) // Keep it as the original string format
            : undefined,
        nestedNodes: collapsedMetadata?.storedNodes
      };

      console.log('Created stored node:', {
        cellId: node.cellId,
        alternativeMetadata: node.alternativeMetadata,
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
    activeCell.sharedModel.setMetadata(
      'alternatives-data',
      JSON.stringify({
        versions: [{ source: combinedSource }],
        activeIndex: 0
      })
    );

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
      notebookPanel.model?.sharedModel.deleteCell(
        notebookPanel.model?.sharedModel.cells.findIndex(c => c.id === cell.id)
      );
    }

    console.log('Collapse operation completed:', {
      activeCell: activeCell.id,
      storedNodes: storedNodes.map(node => ({
        cellId: node.cellId,
        hasNestedNodes: node.nestedNodes !== undefined
      }))
    });
  }

  /**
   * Expand previously collapsed cells
   */
  public expand(cell: ICellModel): void {
    const notebookPanel = this.getNotebookPanel();
    if (!notebookPanel) {
      console.log('No notebook panel found');
      return;
    }

    console.log('Starting expand operation for cell:', cell.id);

    // Get the collapsed metadata
    const metadata = this.getCollapsedMetadata(cell);
    if (!metadata || metadata.storedNodes.length === 0) {
      console.log('No collapsed cells found in metadata');
      return;
    }

    console.log('Found stored nodes:', {
      count: metadata.storedNodes.length,
      nodes: metadata.storedNodes.map(node => node.cellId)
    });

    // Get the index of the current cell
    const currentIndex = notebookPanel.model?.sharedModel.cells.findIndex(
      c => c.id === cell.id
    );

    if (currentIndex === undefined || currentIndex === -1) {
      console.log('Could not find current cell in notebook');
      return;
    }

    // Create new cells for each stored node
    metadata.storedNodes.forEach((node, index) => {
      console.log('Restoring cell:', node.cellId);

      // Create a new cell
      const newCell = notebookPanel.model?.sharedModel.insertCell(
        currentIndex + 1 + index,
        {
          cell_type: 'code',
          id: node.cellId,
          source: node.source
        }
      );
      if (!newCell) {
        console.log('Failed to create new cell');
        return;
      }

      // Only set alternatives metadata if it existed before
      if (node.alternativeMetadata) {
        newCell.setMetadata('alternatives-data', node.alternativeMetadata);
        console.log('Restored alternatives metadata for cell:', node.cellId);
      } else {
        // Make sure no alternatives metadata is set to avoid auto-creation
        newCell.deleteMetadata('alternatives-data');
        console.log(
          'No alternatives metadata to restore for cell:',
          node.cellId
        );
      }

      // Set collapsed metadata
      if (node.nestedNodes && node.nestedNodes.length > 0) {
        newCell.setMetadata(
          'collapsed-data',
          JSON.stringify({
            storedNodes: node.nestedNodes
          })
        );
        console.log('Restored nested collapsed nodes for cell:', node.cellId);
      }
    });

    // remove old cell
    notebookPanel.model?.sharedModel.deleteCell(currentIndex);
  }

  public expandNestedNode(cell: ICellModel, cellIdToExpand: string): void {
    console.log('Starting expandNestedNode operation:', {
      parentCellId: cell.id,
      cellIdToExpand
    });

    // Get the collapsed metadata
    const metadata = this.getCollapsedMetadata(cell);
    if (!metadata || metadata.storedNodes.length === 0) {
      console.log('No collapsed nodes found in metadata');
      return;
    }

    // Function to recursively find the node and replace it with its nested nodes
    const findAndReplaceNode = (nodes: StoredNode[]): boolean => {
      // Check if the node is directly in this array
      const directIndex = nodes.findIndex(
        node => node.cellId === cellIdToExpand
      );

      if (directIndex >= 0) {
        // Found the node, replace it with its nested nodes (if any)
        const targetNode = nodes[directIndex];
        console.log('Found node to expand:', {
          nodeId: targetNode.cellId,
          hasNestedNodes:
            targetNode.nestedNodes && targetNode.nestedNodes.length > 0,
          nestedNodesCount: targetNode.nestedNodes?.length || 0
        });

        // Remove the node from the array
        nodes.splice(directIndex, 1);

        // If it has nested nodes, insert them in its place
        if (targetNode.nestedNodes && targetNode.nestedNodes.length > 0) {
          nodes.splice(directIndex, 0, ...targetNode.nestedNodes);
          console.log('Replaced node with its nested nodes:', {
            originalNodeId: targetNode.cellId,
            insertedNodes: targetNode.nestedNodes.length
          });
        }
        return true;
      }

      // Recursively check nested nodes
      for (const node of nodes) {
        if (node.nestedNodes && node.nestedNodes.length > 0) {
          const found = findAndReplaceNode(node.nestedNodes);
          if (found) {
            return true;
          }
        }
      }

      return false;
    };

    // Find and replace the node with its nested nodes
    const nodeFound = findAndReplaceNode(metadata.storedNodes);

    if (!nodeFound) {
      console.log(
        `Node with cellId ${cellIdToExpand} not found in collapsed metadata`
      );
      return;
    }

    // Update the cell's metadata
    this.setCollapsedMetadata(cell, metadata);

    console.log('Updated cell metadata after expanding nested node');
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
