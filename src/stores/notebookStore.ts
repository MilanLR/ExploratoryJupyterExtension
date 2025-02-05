import { Store } from 'pullstate';

export interface INotebookState {
  activeNotebookId?: string;
  activeNotebookContent?: any;
  isNotebookOpen: boolean;
}

const initialState: INotebookState = {
  activeNotebookId: undefined,
  activeNotebookContent: undefined,
  isNotebookOpen: false
};

export const NotebookStore = new Store(initialState);
