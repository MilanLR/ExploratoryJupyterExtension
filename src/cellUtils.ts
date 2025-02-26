import { ICellModel } from '@jupyterlab/cells';

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

// export function addOutput(cell: ICellModel, output: OutputPlaceholder) {
//   if ('outputs' in cell) {
//     cell.outputs.add(output);
//   }
// }
