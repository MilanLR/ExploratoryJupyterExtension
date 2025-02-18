import { NotebookPanel } from '@jupyterlab/notebook';
import { ICellModel } from '@jupyterlab/cells';

interface IVariableState {
  value: string;
  sourceCell: string; // CellID where this var was defined
  alternativeIndex: number; // Which alternative defined this var
}

interface ICellState {
  stateId: string;
  variables: { [key: string]: IVariableState };
  dependencies: {
    cellId: string;
    alternativeIndex: number;
  }[];
}

export class StateManager {
  constructor(notebookPanel: NotebookPanel) {
    this._notebookPanel = notebookPanel;
    this._states = new Map<string, ICellState>();
  }

  /**
   * Generate a unique state ID based on cell dependencies
   */
  private generateStateId(
    cellId: string,
    alternativeIndex: number,
    dependencies: ICellState['dependencies']
  ): string {
    const depString = dependencies
      .map(dep => `${dep.cellId}-${dep.alternativeIndex}`)
      .sort()
      .join('_');
    return `${cellId}-${alternativeIndex}-${depString}`;
  }

  /**
   * Save the current state of a cell
   */
  async saveState(
    cellId: string,
    alternativeIndex: number,
    variables: string[],
    dependencies: ICellState['dependencies']
  ): Promise<string | null> {
    const kernel = this._notebookPanel.sessionContext.session?.kernel;
    if (!kernel) return null;

    const stateId = this.generateStateId(
      cellId,
      alternativeIndex,
      dependencies
    );

    // Capture specified variables
    const code = `
import json
state = {}
ns = get_ipython().user_ns
for var in ${JSON.stringify(variables)}:
    if var in ns:
        try:
            state[var] = str(ns[var])
        except:
            state[var] = None

_cell_states = getattr(get_ipython(), '_cell_states', {})
_cell_states['${stateId}'] = state
get_ipython()._cell_states = _cell_states
`;

    await kernel.requestExecute({
      code,
      silent: true,
      store_history: false
    }).done;

    const cellState: ICellState = {
      stateId,
      variables: {},
      dependencies
    };

    this._states.set(stateId, cellState);
    return stateId;
  }

  /**
   * Restore the complete state for a cell alternative
   */
  async restoreState(stateId: string): Promise<boolean> {
    const kernel = this._notebookPanel.sessionContext.session?.kernel;
    if (!kernel) return false;

    const code = `
if hasattr(get_ipython(), '_cell_states'):
    state = get_ipython()._cell_states.get('${stateId}', {})
    for key, value in state.items():
        if value is not None:
            exec(f"{key} = {value}")
`;

    await kernel.requestExecute({
      code,
      silent: true,
      store_history: false
    }).done;

    return true;
  }

  /**
   * Restore a specific variable from a cell alternative
   */
  async restoreVariable(
    varName: string,
    cellId: string,
    alternativeIndex: number,
    dependencies: ICellState['dependencies']
  ): Promise<boolean> {
    const kernel = this._notebookPanel.sessionContext.session?.kernel;
    if (!kernel) return false;

    const stateId = this.generateStateId(
      cellId,
      alternativeIndex,
      dependencies
    );

    const code = `
if hasattr(get_ipython(), '_cell_states'):
    state = get_ipython()._cell_states.get('${stateId}', {})
    if '${varName}' in state and state['${varName}'] is not None:
        exec(f"${varName} = {state['${varName}']}")
`;

    await kernel.requestExecute({
      code,
      silent: true,
      store_history: false
    }).done;

    return true;
  }

  /**
   * Get all available variables for a cell state
   */
  async getAvailableVariables(stateId: string): Promise<string[]> {
    const kernel = this._notebookPanel.sessionContext.session?.kernel;
    if (!kernel) return [];

    const code = `
if hasattr(get_ipython(), '_cell_states'):
    state = get_ipython()._cell_states.get('${stateId}', {})
    print(json.dumps(list(state.keys())))
`;

    const response = await kernel.requestExecute({
      code,
      silent: true,
      store_history: false
    }).done;

    // Parse the output to get variable names
    // Note: This would need proper handling of the kernel response
    return [];
  }

  /**
   * Check if a state exists
   */
  hasState(stateId: string): boolean {
    return this._states.has(stateId);
  }

  /**
   * Get dependencies for a state
   */
  getStateDependencies(stateId: string): ICellState['dependencies'] {
    return this._states.get(stateId)?.dependencies || [];
  }

  private _notebookPanel: NotebookPanel;
  private _states: Map<string, ICellState>;
}
