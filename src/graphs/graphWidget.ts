import { Widget } from '@lumino/widgets';
import { DataSet, Network, Options } from 'vis-network/standalone';
import { INotebookModel, NotebookPanel } from '@jupyterlab/notebook';
import {
  AlternativeManager,
  CellAlternatives
} from '../managers/alternativeManager';
import { CollapsedManager } from '../managers/collapsedManager';
import { graphIcon } from '../icons';
import { KernelManager, kernelManager } from '../managers/kernelManager';
import { ICellModel } from '@jupyterlab/cells';
import { CollapsedMetadata } from '../managers/collapsedManager';
import { StoredNode } from '../managers/collapsedManager';
import { NotebookManager } from '../managers/notebookManager';
import { Signal } from '@lumino/signaling';

interface ZoomState {
  node: ICellModel;
  metadata: CollapsedMetadata;
  notebookPanel: NotebookPanel;
}

export class GraphWidget extends Widget {
  private network: Network;
  private nodes: any;
  private edges: any;
  private _content: HTMLElement;
  private alternativeManager: AlternativeManager;
  private currentNotebookPanel: NotebookPanel | null = null;
  private collapsedManager: CollapsedManager;
  private tempNotebookManager: NotebookManager;
  private contextMenu: HTMLDivElement;
  private zoomStack: ZoomState[] = [];
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
      if (this.zoomStack.length > 0) {
        const currentZoom = this.zoomStack.pop();

        // If we still have items in the zoom stack, bring the parent notebook to front
        if (this.zoomStack.length > 0) {
          const parentZoom = this.zoomStack[this.zoomStack.length - 1];
          this.tempNotebookManager.setTempNotebookFront(parentZoom.node);
          this.tempNotebookManager.closeNotebook(currentZoom?.notebookPanel!);
        } else {
          this.tempNotebookManager.closeNotebook(currentZoom?.notebookPanel!);
        }

        this.updateGraphDisplay();
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

        // Handle stored nodes (when zoomed in)
        if (nodeId.startsWith('stored-')) {
          const parts = nodeId.split('-');
          const index = parseInt(parts[1]);
          const isAlt = parts.length > 3 && parts[2] === 'alt';
          const altIndex = isAlt ? parseInt(parts[3]) : 0;

          if (this.zoomStack.length > 0) {
            const currentZoom = this.zoomStack[this.zoomStack.length - 1];
            const storedNode = currentZoom.metadata.storedNodes[index];

            // Add options for stored nodes
            this.addMenuItem('Execute', async () => {
              console.log('Run stored node clicked:', nodeId);
              await kernelManager.executeNestedCell(
                currentZoom.node,
                storedNode.source,
                this.zoomStack.length
              );
            });

            // Add separator after Execute option
            this.addSeparator();

            // If this node has alternatives and this isn't the active one
            const alternativesMetadata: CellAlternatives = JSON.parse(
              storedNode.alternativeMetadata || '[]'
            );
            if (
              alternativesMetadata.versions &&
              alternativesMetadata.versions.length > 1
            ) {
              const activeIndex = alternativesMetadata.activeIndex || 0;
              if (altIndex !== activeIndex) {
                this.addMenuItem('Select Alternative', () => {
                  // Update the active index
                  alternativesMetadata.activeIndex = altIndex;
                  this.updateGraphDisplay();
                });
              }
            }

            // Check if this stored node has nested nodes
            if (storedNode.nestedNodes && storedNode.nestedNodes.length > 0) {
              this.addMenuItem('Zoom In', async () => {
                // Create a new zoom state for this nested node
                const nestedMetadata: CollapsedMetadata = {
                  storedNodes: storedNode.nestedNodes ?? [],
                  notebookName: ''
                };

                const notebookCells = currentZoom.notebookPanel.model?.cells;
                console.log('notebookCells:', notebookCells);
                console.log('storedNode:', storedNode);
                if (!notebookCells) {
                  console.error('No notebook cells found');
                  return;
                }
                let cell: ICellModel | null = null;
                for (const tcell of notebookCells) {
                  console.log('cell.id:', tcell.id);
                  console.log('storedNode.cellId:', storedNode.cellId);
                  if (tcell.id == storedNode.cellId) {
                    cell = tcell;
                    break;
                  }
                }

                if (!cell) {
                  console.error('Cell not found');
                  return;
                }

                const notebookInfo =
                  await this.tempNotebookManager.openTempNotebook(
                    cell,
                    nestedMetadata,
                    currentZoom.notebookPanel
                  );
                if (!notebookInfo) {
                  console.error('Failed to open temp notebook');
                  return;
                }

                this.zoomStack.push({
                  node: currentZoom.node, // Keep the same parent node
                  metadata: nestedMetadata as CollapsedMetadata,
                  notebookPanel: notebookInfo.panel
                });

                this.updateGraphDisplay();
              });

              // Add Expand option for nested nodes
              this.addMenuItem('Expand', () => {
                console.log('Expanding nested node:', storedNode.cellId);

                // Call expandNestedNode on the parent cell
                this.collapsedManager.expandNestedNode(
                  currentZoom.node,
                  storedNode.cellId
                );

                // Force a complete view refresh
                if (this.zoomStack.length > 0) {
                  // Get the current zoom state to refresh its metadata
                  const currentZoom = this.zoomStack[this.zoomStack.length - 1];

                  // Reload the metadata from the node (it might have changed)
                  const updatedMetadata =
                    this.collapsedManager.getCollapsedMetadata(
                      currentZoom.node
                    );
                  if (updatedMetadata) {
                    // Update our zoom stack with fresh metadata
                    currentZoom.metadata = updatedMetadata;
                  }
                }

                // Refresh the display with updated metadata
                this.updateGraphDisplay();
              });
            }
          }
        } else {
          // Original node handling code
          const [cellIndexStr, , altIndexStr] = nodeId.split('-');
          const cellIndex = parseInt(cellIndexStr) - 1;
          const altIndex = parseInt(altIndexStr) - 1;
          if (!this.currentNotebookPanel) return;
          const cell = this.currentNotebookPanel.model?.cells.get(cellIndex);
          if (!cell) return;

          // Add Execute option at the top of the menu
          this.addMenuItem('Execute', async () => {
            console.log('Execute clicked:', nodeId);
            await kernelManager.executeCell(cell, altIndex);
          });

          // Add separator
          this.addSeparator();

          if (this.collapsedManager.isCollapsed(cell)) {
            // Add Zoom option for collapsed nodes
            this.addMenuItem('Zoom In', async () => {
              const metadata = this.collapsedManager.getCollapsedMetadata(cell);
              if (metadata) {
                const notebookCells =
                  this.currentNotebookPanel?.model?.sharedModel.cells;
                if (!notebookCells) {
                  console.error('No notebook cells found');
                  return;
                }

                const notebookInfo =
                  await this.tempNotebookManager.openTempNotebook(
                    cell,
                    metadata,
                    this.currentNotebookPanel!
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

                this.updateGraphDisplay();
              }
            });

            // Only show Expand option if we're at the root level
            if (this.zoomStack.length === 0) {
              this.addMenuItem('Expand', () => {
                this.collapsedManager.expand(cell);
                this.updateNotebook(this.currentNotebookPanel);
              });
            }
          } else {
            // Normal node menu
            this.addMenuItem('Add Alternative', () => {
              this.alternativeManager.addAlternative(
                cell.sharedModel.getSource(),
                cell
              );
              this.updateNotebook(this.currentNotebookPanel);
            });
            if (altIndexStr) {
              const altIndex = parseInt(altIndexStr) - 1;
              const activeIndex = this.alternativeManager.getActiveIndex(cell);
              if (altIndex !== activeIndex) {
                this.addMenuItem('Select Alternative', () => {
                  this.alternativeManager.switchToAlternative(cell, altIndex);
                  this.updateNotebook(this.currentNotebookPanel);
                });
              }
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

      if (!this.currentNotebookPanel) return;

      const cell = this.currentNotebookPanel.model?.cells.get(cellIndex);
      if (!cell) return;

      // Switch to the selected alternative
      this.alternativeManager.switchToAlternative(cell, altIndex);
    });

    // Listen for changes in temp notebooks
    this.tempNotebookManager.tempNotebookChanged.connect(
      this._onTempNotebookChanged,
      this
    );

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

  private updateGraphDisplay(): void {
    // Update zoom out button visibility using the class property
    this.zoomOutButton.style.display =
      this.zoomStack.length > 0 ? 'inline-block' : 'none';

    // Clear existing nodes
    this.nodes.clear();
    this.edges.clear();

    if (this.zoomStack.length > 0) {
      // We're zoomed into a collapsed node
      const currentZoom = this.zoomStack[this.zoomStack.length - 1];
      const storedNodes = currentZoom.metadata.storedNodes;

      // Display the stored nodes
      this.displayStoredNodes(storedNodes);
    } else {
      // Normal notebook view
      this.updateNotebook(this.currentNotebookPanel);
    }
  }

  private displayStoredNodes(nodes: StoredNode[]): void {
    // Add START node
    this.nodes.add({
      id: 'START',
      label: 'START',
      shape: 'box',
      borderRadius: 8,
      x: this.xOffset,
      y: this.yOffset - this.ySpacing,
      color: '#ffd700',
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

    // Create nodes for each stored node
    nodes.forEach((node, index) => {
      // Check if the node has alternatives
      const alternativesMetadata: CellAlternatives = JSON.parse(
        node.alternativeMetadata || '[]'
      ) as CellAlternatives;
      const alternatives = alternativesMetadata.versions || [
        { source: node.source }
      ];
      const activeIndex = alternativesMetadata.activeIndex || 0;

      // Calculate x positions to center alternatives
      const totalWidth = (alternatives.length - 1) * this.xSpacing;
      const startX = this.xOffset - totalWidth / 2;

      // Create nodes for each alternative
      alternatives.forEach((alt, altIndex) => {
        const lines = (alt.source as string)
          .split('\n')
          .filter(line => line.trim());
        const firstTwoLines = lines.slice(0, 2).map(line => {
          const trimmed = line.trim().slice(0, 11);
          return trimmed + (line.length > 11 ? '...' : '');
        });

        const hasNestedNodes = node.nestedNodes && node.nestedNodes.length > 0;

        const nodeId = `stored-${index}-alt-${altIndex}`;

        this.nodes.add({
          id: nodeId,
          label: firstTwoLines.join('\n') || '(empty)',
          shape: 'box',
          borderRadius: 8,
          x: startX + altIndex * this.xSpacing,
          y: this.yOffset + index * this.ySpacing,
          color: hasNestedNodes ? '#808080' : '#8dd3c7',
          borderWidth: altIndex === activeIndex ? 3 : 1,
          widthConstraint: {
            minimum: 135,
            maximum: 135
          },
          heightConstraint: {
            minimum: 50,
            maximum: 50
          }
        });

        // Add edge from previous node or START
        if (index === 0 && altIndex === activeIndex) {
          this.edges.add({
            from: 'START',
            to: nodeId,
            width: 2
          });
        } else if (index > 0 && altIndex === activeIndex) {
          // Connect to the active alternative of the previous node
          const prevNodeId = `stored-${index - 1}-alt-${JSON.parse(nodes[index - 1].alternativeMetadata || '[]').activeIndex || 0}`;
          this.edges.add({
            from: prevNodeId,
            to: nodeId,
            width: 2
          });
        }
      });
    });

    // Update status message
    this._content.innerHTML = `
      <div style="text-align: center; padding: 10px; background-color: var(--jp-layout-color1); border-radius: 4px;">
        Viewing ${nodes.length} collapsed cells
      </div>
    `;
  }

  updateNotebook(notebook: NotebookPanel | null): void {
    this.currentNotebookPanel = notebook;

    if (!notebook) {
      this.clearNotebook();
      return;
    }

    // Check if this is a temp notebook and get its source info
    let isTemp = false;
    let sourceInfo: any = null;

    if (this.tempNotebookManager.isTempNotebook(notebook)) {
      isTemp = true;
      sourceInfo = this.tempNotebookManager.getSourceInfo(
        notebook.context.path
      );

      // If we have source info, use the source notebook for our display
      if (sourceInfo) {
        // We'll still display the zoomed view, but make sure we have the latest data
        // Update the zoom stack with fresh metadata if needed
        if (this.zoomStack.length > 0) {
          const currentZoom = this.zoomStack[this.zoomStack.length - 1];
          // Refresh metadata from the source cell
          const updatedMetadata = this.collapsedManager.getCollapsedMetadata(
            sourceInfo.sourceCell
          );
          if (updatedMetadata) {
            currentZoom.metadata = updatedMetadata;
          }
        }
      }
    }

    // If we're zoomed in, maintain the zoomed view
    if (this.zoomStack.length > 0) {
      this.updateGraphDisplay();
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
          y: this.yOffset + i * this.ySpacing,
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
        Viewing ${codeCellCount} code cells (${totalAlternatives} alternatives)
      </div>
    `;
  }

  clearNotebook(): void {
    this._content.innerHTML =
      '<div style="text-align: center;">Please open a notebook to start using this extension</div>';
  }

  // Add a method to handle temp notebook changes
  private _onTempNotebookChanged = (
    sender: NotebookManager,
    tempNotebookPath: string
  ): void => {
    console.log(
      'Graph widget notified of temp notebook change:',
      tempNotebookPath
    );

    // Get the source info for this temp notebook
    const sourceInfo = this.tempNotebookManager.getSourceInfo(tempNotebookPath);
    if (!sourceInfo) return;

    // If we're zoomed in, update the zoom stack with fresh metadata
    if (this.zoomStack.length > 0) {
      const currentZoom = this.zoomStack[this.zoomStack.length - 1];

      // Refresh metadata from the source cell
      const updatedMetadata = this.collapsedManager.getCollapsedMetadata(
        sourceInfo.sourceCell
      );

      if (updatedMetadata) {
        // Update our zoom stack with fresh metadata
        currentZoom.metadata = updatedMetadata;

        // Refresh the display with updated metadata
        this.updateGraphDisplay();
      }
    }
  };

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
        this.updateGraphDisplay();
      }
      return;
    }

    // If not in zoom stack, we need to add it
    const metadata = this.collapsedManager.getCollapsedMetadata(
      info.sourceCell
    );
    if (metadata) {
      this.zoomStack.push({
        node: info.sourceCell,
        metadata: metadata,
        notebookPanel: info.tempNotebook
      });
      this.updateGraphDisplay();
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

      this.updateGraphDisplay();
    }
  }
}
