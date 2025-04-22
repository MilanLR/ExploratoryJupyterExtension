import { Widget } from '@lumino/widgets';
import { DataSet, Network, Options } from 'vis-network/standalone';
import { NotebookPanel } from '@jupyterlab/notebook';
import {
  AlternativeManager,
  ICellAlternatives
} from '../managers/alternativeManager';
import { CollapsedManager } from '../managers/collapsedManager';
import { graphIcon } from '../icons';
import { kernelManager } from '../managers/kernelManager';
import { ICellModel } from '@jupyterlab/cells';
import { ICollapsedMetadata } from '../managers/collapsedManager';
import { IStoredNode } from '../managers/collapsedManager';
import { NotebookManager } from '../managers/notebookManager';

interface IZoomState {
  node: ICellModel;
  metadata: ICollapsedMetadata;
  notebookPanel: NotebookPanel;
}

export class GraphWidget extends Widget {
  private network: Network;
  private nodes: any;
  private edges: any;
  private _content: HTMLElement;
  private alternativeManager: AlternativeManager;
  private parentNotebookPanel: NotebookPanel | null = null;
  private currentNotebookPanel: NotebookPanel | null = null;
  private collapsedManager: CollapsedManager;
  private tempNotebookManager: NotebookManager;
  private contextMenu: HTMLDivElement;
  private zoomStack: IZoomState[] = [];
  private zoomOutButton: HTMLButtonElement;

  // Graph layout constants
  private xOffset = 250; // Base offset from left
  private yOffset = 350; // Offset from top
  private ySpacing = 200; // Vertical space between nodes
  private xSpacing = 200; // Horizontal space between alternatives

  constructor(
    alternativeManager: AlternativeManager,
    collapsedManager: CollapsedManager,
    tempNotebookManager: NotebookManager
  ) {
    super();
    this.alternativeManager = alternativeManager;
    this.collapsedManager = collapsedManager;
    this.tempNotebookManager = tempNotebookManager;
    this.id = 'graph-widget';
    this.title.icon = graphIcon;
    this.title.caption = 'Graph View';
    this.title.closable = true;

    // Create a container for our content
    this._content = document.createElement('div');
    this._content.className = 'jp-GraphWidget-content';
    this.node.appendChild(this._content);

    // Add zoom out button (initially hidden)
    this.zoomOutButton = document.createElement('button');
    this.zoomOutButton.className = 'jp-GraphWidget-zoomOutButton';
    this.zoomOutButton.innerHTML = 'Zoom Out';
    this.zoomOutButton.style.display = 'none';
    this.zoomOutButton.onclick = () => {
      console.log('zoomstack:', this.zoomStack);
      if (this.zoomStack.length > 0) {
        const currentZoom = this.zoomStack.pop();
        console.log('currentZoom:', currentZoom);
        console.log('zoomstack:', this.zoomStack);
        // If we still have items in the zoom stack, bring the parent notebook to front
        if (this.zoomStack.length > 0) {
          const parentZoom = this.zoomStack[this.zoomStack.length - 1];
          this.tempNotebookManager.setTempNotebookFront(parentZoom.node);
          if (currentZoom?.notebookPanel) {
            this.tempNotebookManager.closeNotebook(currentZoom.notebookPanel);
          }
        } else {
          if (currentZoom?.notebookPanel) {
            this.tempNotebookManager.closeNotebook(currentZoom.notebookPanel);
          }
        }

        this.currentNotebookPanel =
          currentZoom?.notebookPanel ?? this.parentNotebookPanel;
        this.updateNotebookView();
      }
    };
    this.node.appendChild(this.zoomOutButton);

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
        addEdge: (edgeData: any, callback: (edgeData: any) => void) => {
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
    document.body.appendChild(this.contextMenu);

    // Add context menu event handler
    this.network.on('oncontext', properties => {
      properties.event.preventDefault();
      const { pointer } = properties;

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
        // find cell in current notebook panel
        console.log('clickedNodeId:', clickedNodeId);
        const currentNotebookPanel =
          this.zoomStack.length > 0
            ? this.zoomStack[this.zoomStack.length - 1].notebookPanel
            : this.parentNotebookPanel;
        console.log('currentNotebookPanel:', currentNotebookPanel);
        const notebookCells = currentNotebookPanel?.model?.cells;
        console.log('notebookCells:', notebookCells);
        const [cellIndexStr, , altIndexStr] = clickedNodeId.split('-');
        console.log('cellIndexStr:', cellIndexStr, 'altIndexStr:', altIndexStr);
        const cellIndex = parseInt(cellIndexStr) - 1; // Subtract 1 since node IDs are 1-based
        const altIndex = parseInt(altIndexStr) - 1; // Subtract 1 since alt IDs are 1-based
        console.log('cellIndex:', cellIndex, 'altIndex:', altIndex);
        const cell = notebookCells?.get(cellIndex);
        console.log('cell:', cell);

        if (!cell) {
          console.error('Cell not found');
          return;
        }

        if (!this.parentNotebookPanel) {
          console.error('No current notebook panel');
          return;
        }

        // Add Execute option at the top of the menu
        this.addMenuItem('Execute', async () => {
          console.log('Execute clicked:', clickedNodeId);
          await kernelManager.executeCell(cell, altIndex);
        });

        // Add separator
        this.addSeparator();
        console.log(
          'this.collapsedManager.isCollapsed(cell):',
          this.collapsedManager.isCollapsed(cell)
        );
        console.log('cell:', cell);
        console.log(
          'collapsed metadata:',
          this.collapsedManager.getCollapsedMetadata(cell)
        );
        if (this.collapsedManager.isCollapsed(cell)) {
          // Add Zoom option for collapsed nodes
          this.addMenuItem('Zoom In', async () => {
            const metadata = this.collapsedManager.getCollapsedMetadata(cell);
            if (metadata) {
              const notebookCells =
                this.parentNotebookPanel?.model?.sharedModel.cells;
              if (!notebookCells) {
                console.error('No notebook cells found');
                return;
              }

              const notebookInfo =
                await this.tempNotebookManager.openTempNotebook(
                  cell,
                  metadata,
                  this.parentNotebookPanel!
                );

              if (!notebookInfo) {
                console.error('Failed to open temp notebook');
                return;
              }
              console.log('pushing state, notebookInfo:', notebookInfo);
              console.log('zoomstack:', this.zoomStack);
              this.zoomStack.push({
                node: cell,
                metadata: metadata,
                notebookPanel: notebookInfo.panel
              });
              console.log('zoomstack:', this.zoomStack);
              this.currentNotebookPanel = notebookInfo.panel;
              this.updateNotebookView();
            }
          });

          // Only show Expand option if we're at the root level
          if (this.zoomStack.length === 0) {
            this.addMenuItem('Expand', () => {
              this.collapsedManager.expand(cell);
              this.updateNotebookView();
            });
          }
        } else {
          // Normal node menu
          this.addMenuItem('Add Alternative', () => {
            this.alternativeManager.addAlternative(
              cell.sharedModel.getSource(),
              cell
            );
            this.updateNotebookView();
          });
          if (altIndexStr) {
            const altIndex = parseInt(altIndexStr) - 1;
            const activeIndex = this.alternativeManager.getActiveIndex(cell);
            if (altIndex !== activeIndex) {
              this.addMenuItem('Select Alternative', () => {
                this.alternativeManager.switchToAlternative(cell, altIndex);
                this.updateNotebookView();
              });
            }
          }
        }
      }
      // else if (clickedEdgeId) {
      // }

      // Position and show menu - adjust for zoom level
      const rect = container.getBoundingClientRect();

      // Adjust position based on zoom level
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

      if (!this.parentNotebookPanel) {
        console.error('No current notebook panel');
        return;
      }

      const cell = this.parentNotebookPanel.model?.cells.get(cellIndex);
      if (!cell) {
        console.error('No cell found');
        console.log('cellIndex:', cellIndex);
        console.log('this.currentNotebookPanel:', this.parentNotebookPanel);
        return;
      }

      // Switch to the selected alternative
      this.alternativeManager.switchToAlternative(cell, altIndex);
    });

    // Listen for temp notebook activation
    this.tempNotebookManager.tempNotebookActivated.connect(
      this._onTempNotebookActivated,
      this
    );
  }

  private addMenuItem(label: string, onClick: () => void): void {
    const item = document.createElement('div');
    item.className = 'jp-GraphWidget-menuItem';
    item.textContent = label;
    item.addEventListener('click', onClick);
    this.contextMenu.appendChild(item);
  }

  private addSeparator(): void {
    const separator = document.createElement('div');
    separator.className = 'jp-GraphWidget-menuSeparator';
    this.contextMenu.appendChild(separator);
  }

  updateNotebook(notebook: NotebookPanel | null): void {
    console.log('updateNotebook', notebook?.context.path);

    if (!notebook) {
      this.clearNotebook();
      return;
    }

    // Check if this notebook is in the zoom stack
    const zoomIndex = this.zoomStack.findIndex(
      zoomState => zoomState.notebookPanel === notebook
    );

    if (zoomIndex >= 0) {
      // This notebook is in the zoom stack, set current to this notebook
      // but keep parent as is
      this.currentNotebookPanel = notebook;
      this.zoomStack = this.zoomStack.slice(0, zoomIndex + 1);
      console.log('zoomstack1:', this.zoomStack);
    } else {
      // If this is a temp notebook, return
      if (this.tempNotebookManager.isTempNotebook(notebook)) {
        console.log('Skipping temp notebook update:', notebook.context.path);
        return;
      }
      // This is a new notebook, set both parent and current
      this.parentNotebookPanel = notebook;
      this.currentNotebookPanel = notebook;
      // Clear zoom stack when switching to a new parent notebook
      this.zoomStack = [];
      console.log('zoomstack2:', this.zoomStack);
    }

    this.updateNotebookView();
  }

  updateNotebookView(): void {
    console.log('updateNotebookView');
    const notebook = this.currentNotebookPanel;
    if (!notebook) {
      return;
    }

    // Clear existing nodes
    this.nodes.clear();
    this.edges.clear();

    // Create a node for each cell
    const cells = notebook.model?.cells;
    if (!cells) {
      console.error('No cells found');
      return;
    }

    // Add START node
    this.nodes.add({
      id: 'START',
      label: 'START',
      shape: 'box',
      borderRadius: 8,
      x: this.xOffset,
      y: this.yOffset - this.ySpacing, // Position it above the first row
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

    let cellsCreated = -1;
    // Create a node for each cell
    for (let i = 0; i < cells.length; i++) {
      const cell = cells.get(i);

      // Skip non-code cells
      if (cell.type !== 'code') {
        continue;
      }
      cellsCreated++;

      // Check if cell has alternatives
      const alternatives = this.alternativeManager.getAlternatives(cell);
      const activeIndex = this.alternativeManager.getActiveIndex(cell);
      const isCollapsed = this.collapsedManager.isCollapsed(cell);

      // Calculate x positions to center alternatives
      const totalWidth = (alternatives.length - 1) * this.xSpacing;
      const startX = this.xOffset - totalWidth / 2;

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
          x: startX + altIndex * this.xSpacing, // Center alternatives around xOffset
          y: this.yOffset + cellsCreated * this.ySpacing,
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
          // Find the next code cell if any
          let nextCodeCell = nextCell;
          let nextCellIndex = i + 1;
          while (
            nextCodeCell &&
            nextCodeCell.type !== 'code' &&
            nextCellIndex < cells.length - 1
          ) {
            nextCellIndex++;
            nextCodeCell = cells.get(nextCellIndex);
          }

          if (nextCodeCell && nextCodeCell.type === 'code') {
            const nextActiveIndex =
              this.alternativeManager.getActiveIndex(nextCodeCell);
            this.edges.add({
              from: `${i + 1}-alt-${altIndex + 1}`,
              to: `${nextCellIndex + 1}-alt-${nextActiveIndex + 1}`,
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
        Viewing ${codeCellCount} code cells (${totalAlternatives} alternatives)
      </div>
    `;

    this.updateZoomOutButtonVisibility();
  }

  clearNotebook(): void {
    this._content.innerHTML =
      '<div style="text-align: center;">Please open a notebook to start using this extension</div>';
  }

  // Add a method to handle temp notebook activation
  private _onTempNotebookActivated = (
    sender: NotebookManager,
    info: any // TempNotebookInfo
  ): void => {
    console.log('Temp notebook activated:', info.tempNotebookPath);

    // Check if this notebook is already in our zoom stack
    const existingZoomIndex = this.zoomStack.findIndex(
      zoom => zoom.notebookPanel === info.tempNotebook
    );

    if (existingZoomIndex >= 0) {
      console.log(
        'Notebook already in zoom stack at index:',
        existingZoomIndex
      );
      // If it's not the top of the stack, we need to adjust
      if (existingZoomIndex < this.zoomStack.length - 1) {
        // Remove all zoom states above this one
        this.zoomStack.splice(existingZoomIndex + 1);
        this.currentNotebookPanel =
          this.zoomStack[this.zoomStack.length - 1].notebookPanel;
        this.updateNotebookView();
      }
      return;
    }
  };

  // Add this new method
  async zoomToCell(
    cell: ICellModel,
    notebookPanel: NotebookPanel
  ): Promise<void> {
    const metadata = this.collapsedManager.getCollapsedMetadata(cell);
    if (metadata) {
      const notebookInfo = await this.tempNotebookManager.openTempNotebook(
        cell,
        metadata,
        notebookPanel
      );

      if (!notebookInfo) {
        console.error('Failed to open temp notebook');
        return;
      }

      this.zoomStack.push({
        node: cell,
        metadata: metadata,
        notebookPanel: notebookInfo.panel
      });

      this.currentNotebookPanel = notebookInfo.panel;
      this.updateNotebookView();
    }
  }

  private updateZoomOutButtonVisibility(): void {
    this.zoomOutButton.style.display =
      this.zoomStack.length > 0 ? 'block' : 'none';
  }
}
