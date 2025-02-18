import { Widget } from '@lumino/widgets';
import { DataSet, Network, Edge, Node, Options } from 'vis-network/standalone';
import { NotebookStore } from '../stores/notebookStore';
import { INotebookModel } from '@jupyterlab/notebook';
import { AlternativeManager } from '../managers/alternativeManager';
import { CollapsedManager } from '../managers/collapsedManager';

export class GraphWidget extends Widget {
  private network: Network;
  private nodes: any;
  private edges: any;
  private _content: HTMLElement;
  private alternativeManager: AlternativeManager;
  private currentNotebook: INotebookModel | null = null;
  private collapsedManager: CollapsedManager;

  constructor(
    alternativeManager: AlternativeManager,
    collapsedManager: CollapsedManager
  ) {
    super();
    this.alternativeManager = alternativeManager;
    this.collapsedManager = collapsedManager;
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
    this.currentNotebook = notebook;
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

      // Skip non-code cells
      if (cell.type !== 'code') {
        continue;
      }

      // Check if cell has alternatives
      const alternatives = this.alternativeManager.getAlternatives(cell);
      const activeIndex = this.alternativeManager.getActiveIndex(cell);
      const isCollapsed = this.collapsedManager.isCollapsed(cell);

      // Create nodes for each alternative
      alternatives.forEach((alt: any, altIndex: number) => {
        const lines = alt.source
          .split('\n')
          .filter((line: string) => line.trim());
        const firstTwoLines = lines.slice(0, 2).map((line: string) => {
          const trimmed = line.trim().slice(0, 12);
          return trimmed + (line.length > 12 ? '...' : '');
        });

        const altNode = {
          id: `${i + 1}-alt-${altIndex + 1}`,
          label: firstTwoLines.join('\n') || '(empty)',
          shape: 'box',
          borderRadius: 8,
          x: xOffset + altIndex * xSpacing,
          y: yOffset + i * ySpacing,
          color: isCollapsed ? '#808080' : '#8dd3c7', // Grey if collapsed, teal if not
          borderWidth: altIndex === activeIndex ? 3 : 1,
          widthConstraint: {
            minimum: 135,
            maximum: 135
          },
          heightConstraint: {
            minimum: 50,
            maximum: 50
          }
        };
        this.nodes.add(altNode);

        // Add edge to next cell's alternatives if not the last cell
        if (i < cells.length - 1) {
          const nextCell = cells.get(i + 1);
          if (nextCell && nextCell.type === 'code') {
            const nextActiveIndex =
              this.alternativeManager.getActiveIndex(nextCell);
            this.edges.add({
              from: `${i + 1}-alt-${altIndex + 1}`,
              to: `${i + 2}-alt-${nextActiveIndex + 1}`,
              width: 1
            });
          }
        }
      });
    }

    // Update status message
    const codeCellCount = Array.from({ length: cells.length }).filter(
      (_, i) => cells.get(i).type === 'code'
    ).length;
    this._content.innerHTML = `<div style="text-align: center;">Loaded ${codeCellCount} code cells</div>`;
  }

  clearNotebook(): void {
    this._content.innerHTML =
      '<div style="text-align: center;">Please open a notebook to start using this extension</div>';
  }
}
