import { NotebookModel } from '@jupyterlab/notebook';
import { ICellModel } from '@jupyterlab/cells';

interface AlternativeVersion {
  source: string;
  outputs?: any[];
}

export class AlternativeManager {
  private alternatives: Map<string, AlternativeVersion[]> = new Map();
  private activeIndices: Map<string, number> = new Map();

  constructor() {
    console.log('Initializing AlternativeManager');
  }

  /**
   * Add a new alternative version for a cell
   */
  addAlternative(cellId: string, source: string, outputs?: any[]): void {
    console.log(`Adding alternative version for cell ${cellId}`);
    console.log('Source code:', source);
    if (outputs) {
      console.log('Outputs:', outputs);
    }

    if (!this.alternatives.has(cellId)) {
      console.log('First alternative for this cell, initializing arrays');
      this.alternatives.set(cellId, []);
      this.activeIndices.set(cellId, 0);
    }

    const versions = this.alternatives.get(cellId)!;
    versions.push({ source, outputs });
    console.log(
      `Alternative added successfully. Total versions: ${versions.length}`
    );
  }

  /**
   * Move to the next or previous alternative
   */
  moveAlternative(cellId: string, direction: 'left' | 'right'): string | null {
    console.log(`Moving ${direction} for cell ${cellId}`);

    const versions = this.alternatives.get(cellId);
    if (!versions || versions.length <= 1) {
      console.log('No alternatives to move between');
      return null;
    }

    const currentIndex = this.activeIndices.get(cellId)!;
    console.log(`Current index: ${currentIndex}`);

    let newIndex =
      direction === 'left'
        ? (currentIndex - 1 + versions.length) % versions.length
        : (currentIndex + 1) % versions.length;

    console.log(`New index: ${newIndex}`);
    this.activeIndices.set(cellId, newIndex);

    console.log('Returning source code for new version');
    return versions[newIndex].source;
  }

  /**
   * Delete the current alternative version
   */
  deleteAlternative(cellId: string): string | null {
    console.log(`Attempting to delete alternative for cell ${cellId}`);

    const versions = this.alternatives.get(cellId);
    if (!versions || versions.length <= 1) {
      console.log('No alternatives to delete');
      return null;
    }

    const currentIndex = this.activeIndices.get(cellId)!;
    console.log(`Deleting version at index ${currentIndex}`);
    versions.splice(currentIndex, 1);
    console.log(`Remaining versions: ${versions.length}`);

    // Adjust index if needed
    if (currentIndex >= versions.length) {
      console.log('Adjusting index after deletion');
      this.activeIndices.set(cellId, versions.length - 1);
    }

    const newSource = versions[this.activeIndices.get(cellId)!].source;
    console.log('Returning source code for remaining version');
    return newSource;
  }

  /**
   * Get all alternatives for a cell
   */
  getAlternatives(cellId: string): AlternativeVersion[] {
    console.log(`Getting all alternatives for cell ${cellId}`);
    const versions = this.alternatives.get(cellId) || [];
    console.log(`Found ${versions.length} versions`);
    return versions;
  }

  /**
   * Get the active index for a cell
   */
  getActiveIndex(cellId: string): number {
    console.log(`Getting active index for cell ${cellId}`);
    const index = this.activeIndices.get(cellId) || 0;
    console.log(`Active index is ${index}`);
    return index;
  }

  /**
   * Check if a cell has alternatives
   */
  hasAlternatives(cellId: string): boolean {
    console.log(`Checking for alternatives for cell ${cellId}`);
    const versions = this.alternatives.get(cellId);
    const hasAlts = versions ? versions.length > 1 : false;
    console.log(`Has alternatives: ${hasAlts}`);
    return hasAlts;
  }
}
