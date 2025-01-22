import { Widget } from '@lumino/widgets';
import { DataSet, Network, Edge, Node, Options } from 'vis-network/standalone';
// import { DataSet } from 'vis-data';
export class GraphWidget extends Widget {
  private network: Network;
  private nodes: any;
  private edges: any;

  constructor() {
    super();
    this.id = 'graph-widget';
    this.title.label = 'Graph Widget';
    this.title.closable = true;

    this.nodes = new DataSet([]);
    this.edges = new DataSet([]);

    const container = document.createElement('div');
    container.style.width = '100%';
    container.style.height = '100%';
    this.node.appendChild(container);

    const data = {
      nodes: this.nodes,
      edges: this.edges
    };

    const options: Options = {
      manipulation: {
        enabled: true,
        addNode: (data: Node, callback: (data: Node) => {}) => {
          data.label = 'Node ' + (this.nodes.length + 1);
          callback(data);
        },
        addEdge: (data: Edge, callback: (data: Edge) => {}) => {
          if (data.from != data.to) {
            callback(data);
          } else {
          }
        }
      },
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

    const addButton = document.createElement('button');
    addButton.textContent = 'Add Node';
    addButton.style.position = 'absolute';
    addButton.style.top = '10px';
    addButton.style.right = '10px';
    addButton.onclick = () => {
      const newNode = {
        id: this.nodes.length + 1,
        label: 'Node ' + (this.nodes.length + 1)
      };
      this.nodes.add(newNode);
    };
    this.node.appendChild(addButton);

    this.network = new Network(container, data, options);

    // // Restore the state from local storage
    // this.restoreState();

    // // Save the state before the window is unloaded
    // window.addEventListener('beforeunload', () => this.saveState());
  }

  // private saveState() {
  //   const state = {
  //     nodes: this.nodes.get(),
  //     edges: this.edges.get()
  //   };
  //   localStorage.setItem('graphWidgetState', JSON.stringify(state));
  //   console.log(state);
  // }

  // private restoreState() {
  //   const state = localStorage.getItem('graphWidgetState');
  //   if (state) {
  //     console.log(state);
  //     const { nodes, edges } = JSON.parse(state);
  //     this.nodes.add(nodes);
  //     this.edges.add(edges);
  //   }
  // }
}
