import { Kernel, KernelMessage } from '@jupyterlab/services';
import { Signal } from '@lumino/signaling';
import { ICellModel } from '@jupyterlab/cells';
import { AlternativeManager } from './alternativeManager';
import { clearOutputs, setExecutionCount } from '../cellUtils';
import { IOutput } from '@jupyterlab/nbformat';

export class KernelManager {
  private kernel: Kernel.IKernelConnection | null = null;
  private _kernelChanged = new Signal<this, Kernel.IKernelConnection | null>(
    this
  );

  constructor() {
    this.initializeKernelListener();
  }

  get kernelChanged(): Signal<this, Kernel.IKernelConnection | null> {
    return this._kernelChanged;
  }

  private initializeKernelListener() {
    // TODO: Add listener to notebook's kernel changes
    // This will be implemented when we have the notebook context
  }

  setKernel(kernel: Kernel.IKernelConnection | null) {
    this.kernel = kernel;
    this._kernelChanged.emit(kernel);
  }

  requestExecuteCode(
    code: string
  ): Kernel.IFuture<
    KernelMessage.IExecuteRequestMsg,
    KernelMessage.IExecuteReplyMsg
  > {
    if (!this.kernel) {
      throw new Error('No kernel available');
    }
    this.kernel.createComm;

    return this.kernel.requestExecute({
      code: code,
      stop_on_error: true
    });
  }

  async executeCode(
    code: string
  ): Promise<KernelMessage.IExecuteResultMsg['content']> {
    if (!this.kernel) {
      throw new Error('No kernel available');
    }

    const future = this.kernel.requestExecute({
      code: code,
      stop_on_error: true
    });

    return new Promise((resolve, reject) => {
      future.onIOPub = (msg: KernelMessage.IIOPubMessage) => {
        if (
          msg.header.msg_type === 'execute_result' ||
          msg.header.msg_type === 'display_data'
        ) {
          resolve(msg.content as KernelMessage.IExecuteResultMsg['content']);
        }
      };

      future.onReply = (msg: KernelMessage.IExecuteReplyMsg) => {
        if (msg.content.status === 'error') {
          reject(msg.content);
        }
      };
    });
  }

  async executeCell(
    cell: ICellModel,
    alternativeIndex?: number
  ): Promise<
    | Kernel.IFuture<
        KernelMessage.IExecuteRequestMsg,
        KernelMessage.IExecuteReplyMsg
      >
    | undefined
  > {
    if (!this.kernel) return;
    if (cell.type !== 'code') return;
    if (!('outputs' in cell)) {
      // @ts-ignore
      cell.outputs = [];
    }

    const alternativeManager = new AlternativeManager(() => {});
    if (alternativeIndex === undefined) {
      alternativeIndex = alternativeManager.getActiveIndex(cell);
    }
    const code =
      alternativeManager.getAlternatives(cell)[alternativeIndex].source;

    const future = this.requestExecuteCode(code);

    future.onIOPub = (msg: KernelMessage.IIOPubMessage) => {
      console.log('IOPub message received:', msg);

      if (KernelMessage.isStatusMsg(msg)) {
        const status = msg.content.execution_state;
        if (status === 'busy') {
          setExecutionCount(cell, `*${alternativeIndex}`);
          clearOutputs(cell);
        } else if (status === 'idle') {
          setExecutionCount(cell, `a${alternativeIndex}`);
        }
      } else if ('outputs' in cell) {
        const output = {
          ...msg.content,
          execution_count: `a${alternativeIndex}` as any,
          output_type: KernelMessage.isStreamMsg(msg)
            ? 'stream'
            : 'execute_result'
        };
        console.log('Adding output:', output);
        (cell.outputs as any).add(output);
      }
    };

    return future;
  }
}

export const kernelManager = new KernelManager();
