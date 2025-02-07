import { NotebookModel } from '@jupyterlab/notebook';
import { ICellModel } from '@jupyterlab/cells';

interface AlternativeVersion {
  source: string;
}

interface CellAlternatives {
  versions: AlternativeVersion[];
  activeIndex: number;
}

export class AlternativeManager {
  constructor() {
    console.log('Initializing AlternativeManager');
  }

  /**
   * Retrieves the alternative versions metadata for a cell
   * @param cell The cell model to get metadata from
   * @returns The cell's alternatives data, including versions and active index
   */
  private getCellMetadata(cell: ICellModel): CellAlternatives {
    console.log('Getting cell metadata');
    const loadedMetadata = cell.sharedModel.getMetadata('alternatives');
    console.log('Loaded metadata:', loadedMetadata);
    if (loadedMetadata === undefined) {
      return {
        versions: [],
        activeIndex: 0
      };
    }
    const parsedMetadata = JSON.parse(loadedMetadata as string);
    console.log('Parsed metadata:', parsedMetadata);
    return parsedMetadata as CellAlternatives;
  }

  /**
   * Sets the alternative versions metadata for a cell
   * @param cell The cell model to set metadata on
   * @param data The alternatives data to store
   */
  private setCellMetadata(cell: ICellModel, data: CellAlternatives) {
    console.log('Setting cell metadata');
    console.log('Data to set:', data);

    // Store the alternatives data as a JSON string in the cell metadata
    cell.sharedModel.setMetadata('alternatives', JSON.stringify(data));

    console.log('Cell metadata updated successfully');
  }

  /**
   * Add a new alternative version for a cell
   */
  addAlternative(cellId: string, source: string, cell: ICellModel): void {
    console.log(`Adding alternative version for cell ${cellId}`);
    console.log('Source code:', source);

    const cellData = this.getCellMetadata(cell);

    // If this is the first version, initialize with the current version
    if (cellData.versions.length === 0) {
      cellData.versions.push({ source });
      cellData.activeIndex = 0;
    }

    // Add the new version
    cellData.versions.push({ source });
    this.setCellMetadata(cell, cellData);

    console.log(
      `Alternative added successfully. Total versions: ${cellData.versions.length}`
    );
  }

  /**
   * Move to the next or previous alternative
   */
  moveAlternative(
    cellId: string,
    direction: 'left' | 'right',
    cell: ICellModel
  ): string | null {
    console.log(`Moving ${direction} for cell ${cellId}`);

    const cellData = this.getCellMetadata(cell);
    if (cellData.versions.length <= 1) {
      console.log('No alternatives to move between');
      return null;
    }

    const currentIndex = cellData.activeIndex;
    console.log(`Current index: ${currentIndex}`);

    let newIndex =
      direction === 'left'
        ? (currentIndex - 1 + cellData.versions.length) %
          cellData.versions.length
        : (currentIndex + 1) % cellData.versions.length;

    console.log(`New index: ${newIndex}`);
    cellData.activeIndex = newIndex;
    this.setCellMetadata(cell, cellData);

    console.log('Returning source code for new version');
    return cellData.versions[newIndex].source;
  }

  /**
   * Delete the current alternative version
   */
  deleteAlternative(cellId: string, cell: ICellModel): string | null {
    console.log(`Attempting to delete alternative for cell ${cellId}`);

    const cellData = this.getCellMetadata(cell);
    if (cellData.versions.length <= 1) {
      console.log('No alternatives to delete');
      return null;
    }

    const currentIndex = cellData.activeIndex;
    console.log(`Deleting version at index ${currentIndex}`);
    cellData.versions.splice(currentIndex, 1);
    console.log(`Remaining versions: ${cellData.versions.length}`);

    // Adjust index if needed
    if (currentIndex >= cellData.versions.length) {
      console.log('Adjusting index after deletion');
      cellData.activeIndex = cellData.versions.length - 1;
    }

    this.setCellMetadata(cell, cellData);
    const newSource = cellData.versions[cellData.activeIndex].source;
    console.log('Returning source code for remaining version');
    return newSource;
  }

  /**
   * Get all alternatives for a cell
   */
  getAlternatives(cellId: string, cell: ICellModel): AlternativeVersion[] {
    console.log(`Getting all alternatives for cell ${cellId}`);
    const cellData = this.getCellMetadata(cell);
    console.log(`Found ${cellData.versions.length} versions`);
    return cellData.versions;
  }

  /**
   * Get the active index for a cell
   */
  getActiveIndex(cellId: string, cell: ICellModel): number {
    console.log(`Getting active index for cell ${cellId}`);
    const cellData = this.getCellMetadata(cell);
    console.log(`Active index is ${cellData.activeIndex}`);
    return cellData.activeIndex;
  }

  /**
   * Check if a cell has alternatives
   */
  hasAlternatives(cellId: string, cell: ICellModel): boolean {
    console.log(`Checking for alternatives for cell ${cellId}`);
    const cellData = this.getCellMetadata(cell);
    const hasAlts = cellData.versions.length > 1;
    console.log(`Has alternatives: ${hasAlts}`);
    return hasAlts;
  }

  /**
   * Update the current alternative version with edited content
   */
  updateCurrentVersion(
    cellId: string,
    cell: ICellModel,
    newSource: string
  ): void {
    console.log(`Updating current version for cell ${cellId}`);

    const cellData = this.getCellMetadata(cell);
    if (cellData.versions.length === 0) {
      // If no versions exist, create the first one
      cellData.versions.push({ source: newSource });
      cellData.activeIndex = 0;
    } else {
      // Update the current version
      cellData.versions[cellData.activeIndex].source = newSource;
    }

    this.setCellMetadata(cell, cellData);
    console.log('Current version updated successfully');
  }
}
