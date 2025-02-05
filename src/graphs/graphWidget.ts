import { Widget } from '@lumino/widgets';
import { DataSet, Network, Edge, Node, Options } from 'vis-network/standalone';
import { NotebookStore } from '../stores/notebookStore';

interface NotebookCell {
  id: string;
  cell_type: 'code' | 'markdown'; // Specify the possible cell types
  source: string;
  metadata: {
    trusted: boolean;
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

  constructor() {
    super();
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

  updateNotebook(notebookData: any): void {
    console.log('Widget received notebook data:', notebookData);

    if (!notebookData) {
      this.clearNotebook();
      return;
    }

    // Parse the notebook data into our typed interface
    const notebook = notebookData as NotebookData;

    // Clear existing nodes
    this.nodes.clear();
    this.edges.clear();

    // Create a node for each cell
    const cells = notebook.cells;
    console.log('Cells:', cells);

    const xOffset = 350; // Offset from left
    const yOffset = 350; // Offset from top
    const ySpacing = 100; // Vertical space between nodes

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      console.log('Cell:', cell);

      const cellContent = cell.source;
      console.log('Cell content:', cellContent);

      const cellType = cell.cell_type;
      const truncatedContent =
        cellContent.slice(0, 20) + (cellContent.length > 20 ? '...' : '');

      const newNode = {
        id: i + 1,
        label: `${cellType}\n${truncatedContent || `Cell ${i + 1}`}`,
        x: xOffset,
        y: yOffset + i * ySpacing, // Position nodes vertically with equal spacing
        // fixed: {
        //   x: true,
        //   y: true
        // },
        color: cellType === 'code' ? '#8dd3c7' : '#fb8072'
      };

      console.log('Adding node:', newNode);
      this.nodes.add(newNode);

      // Add edge to previous cell
      if (i > 0) {
        const newEdge = {
          from: i,
          to: i + 1
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
