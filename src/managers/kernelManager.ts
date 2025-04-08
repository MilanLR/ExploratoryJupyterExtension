import { Kernel, KernelMessage } from '@jupyterlab/services';
import { Signal } from '@lumino/signaling';
import { ICellModel } from '@jupyterlab/cells';
import { AlternativeManager } from './alternativeManager';
import { clearOutputs, setExecutionCount } from '../cellUtils';

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
      future.onReply = (msg: KernelMessage.IExecuteReplyMsg) => {
        if (msg.content.status === 'error') {
          reject(msg.content);
        }
      };

      // Register message hook for this execution
      this.kernel!.registerMessageHook(future.msg.header.msg_id, msg => {
        if (
          msg.header.msg_type === 'execute_result' ||
          msg.header.msg_type === 'display_data'
        ) {
          resolve(msg.content as KernelMessage.IExecuteResultMsg['content']);
          return true;
        }
        return true;
      });
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
    if (!this.kernel) {
      return;
    }
    if (cell.type !== 'code') {
      return;
    }
    if (!('outputs' in cell)) {
      // @ts-expect-error ICellModel.outputs does not have outputs
      cell.outputs = [];
    }

    const alternativeManager = new AlternativeManager(() => {});
    if (alternativeIndex === undefined) {
      alternativeIndex = alternativeManager.getActiveIndex(cell);
    }
    const code =
      alternativeManager.getAlternatives(cell)[alternativeIndex].source;

    const future = this.requestExecuteCode(code);

    // Register message hook for this execution
    this.kernel.registerMessageHook(future.msg.header.msg_id, msg => {
      console.log('Message hook received:', msg);

      if (KernelMessage.isStatusMsg(msg)) {
        const status = msg.content.execution_state;
        if (status === 'busy') {
          setExecutionCount(cell, `*${alternativeIndex}`);
          clearOutputs(cell);
        } else if (status === 'idle') {
          setExecutionCount(cell, `a${alternativeIndex}`);
        }
      } else if ('outputs' in cell && !KernelMessage.isExecuteInputMsg(msg)) {
        const output = {
          ...msg.content,
          execution_count: `a${alternativeIndex}` as any,
          output_type: KernelMessage.isStreamMsg(msg)
            ? 'stream'
            : KernelMessage.isErrorMsg(msg)
              ? 'error'
              : 'execute_result'
        };
        console.log('Adding output:', output);
        (cell.outputs as any).add(output);
      }

      // Return true to keep the message in the kernel's message handling pipeline
      return false;
    });

    return future;
  }

  async executeNestedCell(
    cell: ICellModel,
    code: string,
    zoomDepth?: number
  ): Promise<
    | Kernel.IFuture<
        KernelMessage.IExecuteRequestMsg,
        KernelMessage.IExecuteReplyMsg
      >
    | undefined
  > {
    if (!this.kernel) {
      return;
    }
    if (cell.type !== 'code') {
      return;
    }
    if (!('outputs' in cell)) {
      // @ts-expect-error ICellModel.outputs does not have outputs
      cell.outputs = [];
    }

    // Use provided alternativeIndex or default to 0
    zoomDepth = zoomDepth ?? 0;

    const future = this.requestExecuteCode(code);

    // Register message hook for this execution
    this.kernel.registerMessageHook(future.msg.header.msg_id, msg => {
      console.log('Nested message hook received:', msg);

      if (KernelMessage.isStatusMsg(msg)) {
        const status = msg.content.execution_state;
        if (status === 'busy') {
          setExecutionCount(cell, `n${zoomDepth}`);
          clearOutputs(cell);
        } else if (status === 'idle') {
          setExecutionCount(cell, `n${zoomDepth}`);
        }
      } else if ('outputs' in cell && !KernelMessage.isExecuteInputMsg(msg)) {
        const output = {
          ...msg.content,
          execution_count: `n${zoomDepth}` as any,
          output_type: KernelMessage.isStreamMsg(msg)
            ? 'stream'
            : KernelMessage.isErrorMsg(msg)
              ? 'error'
              : 'execute_result'
        };
        console.log('Adding nested output:', output);
        (cell.outputs as any).add(output);
      }

      // Return false to prevent the message from continuing in the kernel's message handling pipeline
      return false;
    });

    return future;
  }
}

export const kernelManager = new KernelManager();
