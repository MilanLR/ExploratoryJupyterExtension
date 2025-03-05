import { ICellModel } from '@jupyterlab/cells';
import { NotebookModel, INotebookModel } from '@jupyterlab/notebook';
import { StoredNode } from './managers/collapsedManager';

export function setExecutionCount(cell: ICellModel, value: string) {
  if ('executionCount' in cell) {
    cell.executionCount = value;
  }
}

export function clearOutputs(cell: ICellModel) {
  if ('outputs' in cell) {
    (cell.outputs as any).clear();
  }
}

/**
 * Convert a cell model to a stored node format
 */
export function cellModelToStoredNode(cell: ICellModel): StoredNode {
  // Get alternatives metadata if it exists
  const alternativesMetadata =
    cell.sharedModel.getMetadata('alternatives-data');

  // Get any existing collapsed metadata
  const collapsedMetadata = cell.sharedModel.getMetadata('collapsed-data');

  let nestedNodes: StoredNode[] | undefined;
  if (collapsedMetadata) {
    try {
      const parsed = JSON.parse(collapsedMetadata as string);
      nestedNodes = parsed.storedNodes || undefined;
    } catch (e) {
      console.error('Error parsing collapsed metadata:', e);
    }
  }

  return {
    cellId: cell.id,
    source: cell.sharedModel.getSource(),
    alternativeMetadata: alternativesMetadata
      ? (alternativesMetadata as string)
      : undefined,
    nestedNodes
  };
}

/**
 * Convert stored nodes to a notebook model
 */
export function storedNodesToNotebookModel(
  nodes: StoredNode[]
): INotebookModel {
  const model = new NotebookModel();

  // Remove all cells from the model
  while (model.cells.length > 0) {
    model.sharedModel.deleteCell(0);
  }

  // Add cells for each stored node
  for (const node of nodes) {
    const cell = model.sharedModel.addCell({
      cell_type: 'code',
      id: node.cellId,
      source: node.source
    });

    if (node.alternativeMetadata) {
      try {
        // Parse and set the alternatives metadata
        const alternativesData = JSON.parse(node.alternativeMetadata);
        cell.setMetadata('alternatives-data', node.alternativeMetadata);

        // Log for debugging
        console.log('Restoring alternatives for cell:', {
          cellId: node.cellId,
          alternatives: alternativesData
        });
      } catch (e) {
        console.error('Error parsing alternatives metadata:', e);
      }
    }

    if (node.nestedNodes && node.nestedNodes.length > 0) {
      cell.setMetadata(
        'collapsed-data',
        JSON.stringify({ storedNodes: node.nestedNodes })
      );
    }
  }

  return model;
}

// export function addOutput(cell: ICellModel, output: OutputPlaceholder) {
//   if ('outputs' in cell) {
//     cell.outputs.add(output);
//   }
// }
