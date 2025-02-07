import { Widget } from '@lumino/widgets';
import { DataSet, Network, Edge, Node, Options } from 'vis-network/standalone';
import { NotebookStore } from '../stores/notebookStore';
import { INotebookModel } from '@jupyterlab/notebook';
import { AlternativeManager } from '../alternatives/alternativeManager';
import { ICellModel } from '@jupyterlab/cells';

interface NotebookCell {
  id: string;
  cell_type: 'code' | 'markdown'; // Specify the possible cell types
  source: string;
  metadata: {
    trusted: boolean;
    alternatives?: any[];
  };
  outputs: any[];
  execution_count: number | null;
}

interface LanguageInfo {
  codemirror_mode: {
    name: string;
    version: number;
  };
  file_extension: string;
  mimetype: string;
  name: string;
  nbconvert_exporter: string;
  pygments_lexer: string;
  version: string;
}

interface KernelSpec {
  display_name: string;
  language: string;
  name: string;
}

export interface NotebookData {
  metadata: {
    kernelspec: KernelSpec;
    language_info: LanguageInfo;
  };
  nbformat_minor: number;
  nbformat: number;
  cells: NotebookCell[];
}

export class GraphWidget extends Widget {
  private network: Network;
  private nodes: any;
  private edges: any;
  private _content: HTMLElement;
  private alternativeManager: AlternativeManager;
  private currentNotebook: INotebookModel | null = null;

  constructor(alternativeManager: AlternativeManager) {
    super();
    this.alternativeManager = alternativeManager;
    this.addClass('jp-GraphWidget');
    this.id = 'graph-widget';
    this.title.label = 'Graph View';
    this.title.closable = true;

    // Create a container for our content
    this._content = document.createElement('div');
    this._content.className = 'jp-GraphWidget-content';
    this.node.appendChild(this._content);

    // Show initial message
    this.clearNotebook();

    this.nodes = new DataSet([]);
    this.edges = new DataSet([]);

    const container = document.createElement('div');
    container.className = 'jp-GraphWidget-container';
    this.node.appendChild(container);

    const data = {
      nodes: this.nodes,
      edges: this.edges
    };

    const options: Options = {
      physics: {
        enabled: false
      },
      edges: {
        smooth: {
          enabled: false,
          type: 'cubicBezier',
          roundness: 0.5
        },
        arrows: {
          to: {
            enabled: true,
            scaleFactor: 1
          }
        }
      }
    };

    this.network = new Network(container, data, options);

    // Add double click event handler
    this.network.on('doubleClick', properties => {
      const nodeId = properties.nodes[0];
      if (!nodeId || typeof nodeId !== 'string' || !nodeId.includes('-alt-')) {
        return; // Only handle alternative nodes
      }

      // Parse the cell index and alternative index from the node ID
      // Format is "{cellIndex}-alt-{altIndex}"
      const [cellIndexStr, , altIndexStr] = nodeId.split('-');
      const cellIndex = parseInt(cellIndexStr) - 1; // Subtract 1 since node IDs are 1-based
      const altIndex = parseInt(altIndexStr) - 1; // Subtract 1 since alt IDs are 1-based

      if (!this.currentNotebook) return;

      const cell = this.currentNotebook.cells.get(cellIndex);
      if (!cell) return;

      // Switch to the selected alternative
      this.alternativeManager.switchToAlternative(cell, altIndex);
    });

    // Subscribe to notebook changes
    NotebookStore.subscribe(
      s => s.activeNotebookContent,
      notebookContent => {
        if (notebookContent) {
          this.updateNotebook(notebookContent);
        } else {
          this.clearNotebook();
        }
      }
    );
  }

  updateNotebook(notebook: INotebookModel | null): void {
    this.currentNotebook = notebook; // Store reference to current notebook
    console.log('Widget received notebook data:', notebook);

    if (!notebook) {
      this.clearNotebook();
      return;
    }

    // Clear existing nodes
    this.nodes.clear();
    this.edges.clear();

    // Create a node for each cell
    const cells = notebook.cells;

    const xOffset = 350; // Base offset from left
    const yOffset = 350; // Offset from top
    const ySpacing = 100; // Vertical space between nodes
    const xSpacing = 200; // Horizontal space between alternatives

    for (let i = 0; i < cells.length; i++) {
      const cell = cells.get(i);
      console.log('Cell:', cell);

      // Check if cell has alternatives
      const alternatives = this.alternativeManager.getAlternatives(cell);
      const isActive = true; // TODO: Get this from cell metadata

      // Create node for main cell
      const cellContent = cell.sharedModel.getSource();
      const cellType = cell.type;
      const truncatedContent =
        cellContent.slice(0, 20) + (cellContent.length > 20 ? '...' : '');

      const mainNode = {
        id: i + 1,
        label: `${cellType}\n${truncatedContent || `Cell ${i + 1}`}`,
        x: xOffset,
        y: yOffset + i * ySpacing,
        color: cellType === 'code' ? '#8dd3c7' : '#fb8072',
        borderWidth: isActive ? 3 : 1
      };

      console.log('Adding node:', mainNode);
      this.nodes.add(mainNode);
      console.log('Adding alternatives:', alternatives);
      // Add alternatives as nodes to the right
      alternatives.forEach((alt: any, altIndex: number) => {
        const altNode = {
          id: `${i + 1}-alt-${altIndex + 1}`,
          label: `Alternative ${altIndex + 1}\n${alt.source.slice(0, 20)}...`,
          x: xOffset + (altIndex + 1) * xSpacing,
          y: yOffset + i * ySpacing,
          color: cellType === 'code' ? '#8dd3c7' : '#fb8072',
          borderWidth: alt.isActive ? 3 : 1
        };
        this.nodes.add(altNode);

        // Add edge between main cell and alternative
        this.edges.add({
          from: i + 1,
          to: `${i + 1}-alt-${altIndex + 1}`,
          dashes: true,
          color: { color: '#848484' }
        });
      });

      // Add edge to previous cell
      if (i > 0) {
        const newEdge = {
          from: i,
          to: i + 1,
          width: isActive ? 3 : 1
        };
        console.log('Adding edge:', newEdge);
        this.edges.add(newEdge);
      }
    }

    // Update status message
    this._content.innerHTML = `<div style="text-align: center;">Loaded ${cells.length} cells</div>`;
  }

  clearNotebook(): void {
    this._content.innerHTML =
      '<div style="text-align: center;">Please open a notebook to start using this extension</div>';
  }
}
