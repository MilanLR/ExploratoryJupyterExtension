import { Widget } from '@lumino/widgets';
import { DataSet, Network, Options } from 'vis-network/standalone';
import { INotebookModel } from '@jupyterlab/notebook';
import { AlternativeManager } from '../managers/alternativeManager';
import { CollapsedManager } from '../managers/collapsedManager';
import { graphIcon } from '../icons';
import { KernelManager, kernelManager } from '../managers/kernelManager';

export class GraphWidget extends Widget {
  private network: Network;
  private nodes: any;
  private edges: any;
  private _content: HTMLElement;
  private alternativeManager: AlternativeManager;
  private currentNotebook: INotebookModel | null = null;
  private collapsedManager: CollapsedManager;
  private contextMenu: HTMLDivElement;

  constructor(
    alternativeManager: AlternativeManager,
    collapsedManager: CollapsedManager
  ) {
    super();
    this.alternativeManager = alternativeManager;
    this.collapsedManager = collapsedManager;
    this.id = 'graph-widget';
    this.title.icon = graphIcon;
    this.title.caption = 'Graph View';
    this.title.closable = true;

    // Create a container for our content
    this._content = document.createElement('div');
    this._content.className = 'jp-GraphWidget-content';
    this.node.appendChild(this._content);

    // Add run session button
    const runButton = document.createElement('button');
    runButton.className = 'jp-GraphWidget-runButton';
    runButton.innerHTML = 'Run full session';
    runButton.onclick = () => {
      // TODO: Implement run session functionality
      console.log('Run full session clicked');
    };
    this.node.appendChild(runButton);

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
      },
      manipulation: {
        enabled: true,
        addNode: false,
        deleteNode: false,
        addEdge: (edgeData: any, callback: Function) => {
          if (edgeData.from && edgeData.to) {
            callback(edgeData);
          }
        },
        editEdge: false
      },
      interaction: {
        dragNodes: false,
        dragView: true
      },
      nodes: {
        fixed: {
          x: true,
          y: true
        }
      }
    };

    this.network = new Network(container, data, options);

    // Create context menu element
    this.contextMenu = document.createElement('div');
    this.contextMenu.className = 'jp-GraphWidget-contextMenu';
    this.contextMenu.style.position = 'absolute';
    this.contextMenu.style.display = 'none';
    this.contextMenu.style.zIndex = '1000';
    this.contextMenu.style.backgroundColor = 'white';
    this.contextMenu.style.border = '1px solid #ccc';
    this.contextMenu.style.padding = '5px';
    this.contextMenu.style.boxShadow = '2px 2px 6px rgba(0,0,0,0.2)';
    document.body.appendChild(this.contextMenu);

    // Add context menu event handler
    this.network.on('oncontext', properties => {
      properties.event.preventDefault();
      const { pointer, nodes, edges } = properties;

      // Clear previous menu
      this.contextMenu.innerHTML = '';

      // Get the node/edge at the clicked position
      const clickedNodeId = this.network.getNodeAt(pointer.DOM) as string;
      const clickedEdgeId = this.network.getEdgeAt(pointer.DOM) as string;

      // Only show menu if clicking on something
      if (!clickedNodeId && !clickedEdgeId) {
        this.contextMenu.style.display = 'none';
        return;
      }

      if (clickedNodeId) {
        // Node context menu
        const nodeId = clickedNodeId;
        const [cellIndexStr, , altIndexStr] = nodeId.split('-');
        const cellIndex = parseInt(cellIndexStr) - 1;
        const altIndex = parseInt(altIndexStr) - 1;
        if (!this.currentNotebook) return;
        const cell = this.currentNotebook.cells.get(cellIndex);
        if (!cell) return;

        // Add Run Node option at the top of the menu
        this.addMenuItem('Run Node', async () => {
          console.log('Run node clicked:', nodeId);
          await kernelManager.executeCell(cell, altIndex);
        });

        // Add separator
        const separator = document.createElement('div');
        separator.className = 'jp-GraphWidget-menuSeparator';
        this.contextMenu.appendChild(separator);

        if (this.collapsedManager.isCollapsed(cell)) {
          // Collapsed node menu
          this.addMenuItem('Expand', () => {
            this.collapsedManager.expand(cell);
            this.updateNotebook(this.currentNotebook);
          });
        } else {
          // Normal node menu
          this.addMenuItem('Add Alternative', () => {
            this.alternativeManager.addAlternative(
              cell.sharedModel.getSource(),
              cell
            );
            this.updateNotebook(this.currentNotebook);
          });
          if (altIndexStr) {
            const altIndex = parseInt(altIndexStr) - 1;
            const activeIndex = this.alternativeManager.getActiveIndex(cell);
            if (altIndex !== activeIndex) {
              this.addMenuItem('Select Alternative', () => {
                this.alternativeManager.switchToAlternative(cell, altIndex);
                this.updateNotebook(this.currentNotebook);
              });
            }
          }
        }
      } else if (clickedEdgeId) {
        // Edge context menu
        this.addMenuItem('Remove Edge', () => {
          this.edges.remove(clickedEdgeId);
        });
      }

      // Position and show menu
      const rect = container.getBoundingClientRect();
      this.contextMenu.style.left = pointer.DOM.x + rect.left + 'px';
      this.contextMenu.style.top = pointer.DOM.y + rect.top + 'px';
      this.contextMenu.style.display = 'block';
    });

    // Hide context menu when clicking elsewhere
    document.addEventListener('click', () => {
      this.contextMenu.style.display = 'none';
    });

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
  }

  private addMenuItem(label: string, onClick: () => void): void {
    const item = document.createElement('div');
    item.className = 'jp-GraphWidget-menuItem';
    item.style.padding = '5px 10px';
    item.style.cursor = 'pointer';
    item.textContent = label;
    item.addEventListener('click', onClick);
    this.contextMenu.appendChild(item);
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
    const ySpacing = 200; // Vertical space between nodes
    const xSpacing = 200; // Horizontal space between alternatives

    // Add START node
    this.nodes.add({
      id: 'START',
      label: 'START',
      shape: 'box',
      borderRadius: 8,
      x: xOffset,
      y: yOffset - ySpacing, // Position it above the first row
      color: '#ffd700', // Yellow color
      borderWidth: 2,
      font: {
        size: 24,
        bold: true
      },
      widthConstraint: {
        minimum: 135,
        maximum: 135
      },
      heightConstraint: {
        minimum: 50,
        maximum: 50
      }
    });

    // Find first code cell and its active alternative
    for (let i = 0; i < cells.length; i++) {
      const cell = cells.get(i);
      if (cell.type === 'code') {
        const activeIndex = this.alternativeManager.getActiveIndex(cell);
        // Add edge from START to first active code cell
        this.edges.add({
          from: 'START',
          to: `${i + 1}-alt-${activeIndex + 1}`,
          width: 2
        });
        break;
      }
    }

    // Create a node for each cell
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

      // Calculate x positions to center alternatives
      const totalWidth = (alternatives.length - 1) * xSpacing;
      const startX = xOffset - totalWidth / 2;

      // Create nodes for each alternative
      alternatives.forEach((alt: any, altIndex: number) => {
        const lines = alt.source
          .split('\n')
          .filter((line: string) => line.trim());
        const firstTwoLines = lines.slice(0, 2).map((line: string) => {
          const trimmed = line.trim().slice(0, 11);
          return trimmed + (line.length > 11 ? '...' : '');
        });

        const altNode = {
          id: `${i + 1}-alt-${altIndex + 1}`,
          label: firstTwoLines.join('\n') || '(empty)',
          shape: 'box',
          borderRadius: 8,
          x: startX + altIndex * xSpacing, // Center alternatives around xOffset
          y: yOffset + i * ySpacing,
          color: isCollapsed ? '#808080' : '#8dd3c7',
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
        if (i < cells.length - 1 && altIndex === activeIndex) {
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

    // Count total alternatives
    let totalAlternatives = 0;
    for (let i = 0; i < cells.length; i++) {
      const cell = cells.get(i);
      if (cell.type === 'code') {
        const alternatives = this.alternativeManager.getAlternatives(cell);
        totalAlternatives += alternatives.length;
      }
    }

    this._content.innerHTML = `
      <div style="text-align: center; padding: 10px; background-color: var(--jp-layout-color1); border-radius: 4px;">
        Loaded ${codeCellCount} code cells (${totalAlternatives} alternatives)
      </div>
    `;
  }

  clearNotebook(): void {
    this._content.innerHTML =
      '<div style="text-align: center;">Please open a notebook to start using this extension</div>';
  }
}
