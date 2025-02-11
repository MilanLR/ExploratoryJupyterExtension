import { ICellModel } from '@jupyterlab/cells';

interface AlternativeVersion {
  source: string;
}

interface CellAlternatives {
  versions: AlternativeVersion[];
  activeIndex: number;
}

export class AlternativeManager {
  private refreshButtonsCallback: () => void;

  constructor(refreshButtonsCallback: () => void) {
    this.refreshButtonsCallback = refreshButtonsCallback;
  }

  /**
   * Retrieves the alternative versions metadata for a cell
   * @param cell The cell model to get metadata from
   * @returns The cell's alternatives data, including versions and active index
   */
  private getCellMetadata(cell: ICellModel): CellAlternatives {
    const loadedMetadata = cell.sharedModel.getMetadata('alternatives');
    if (loadedMetadata === undefined) {
      return {
        versions: [{ source: '' }],
        activeIndex: 0
      };
    }
    const parsedMetadata = JSON.parse(loadedMetadata as string);
    return parsedMetadata as CellAlternatives;
  }

  /**
   * Sets the alternative versions metadata for a cell
   * @param cell The cell model to set metadata on
   * @param data The alternatives data to store
   */
  private setCellMetadata(cell: ICellModel, data: CellAlternatives) {
    cell.sharedModel.setMetadata('alternatives', JSON.stringify(data));
  }

  /**
   * Add a new alternative version for a cell
   */
  addAlternative(source: string, cell: ICellModel): void {
    const cellData = this.getCellMetadata(cell);

    // If this is the first version, initialize with the current version
    if (cellData.versions.length === 0) {
      cellData.versions.push({ source });
      cellData.activeIndex = 0;
    }

    // Add the new version
    cellData.versions.push({ source });
    cellData.activeIndex = cellData.versions.length - 1;
    this.setCellMetadata(cell, cellData);
    this.refreshButtonsCallback();
  }

  /**
   * Move to the next or previous alternative
   */
  moveAlternative(direction: 'left' | 'right', cell: ICellModel): void {
    const cellData = this.getCellMetadata(cell);
    if (cellData.versions.length <= 1) {
      return;
    }

    const currentIndex = cellData.activeIndex;
    let newIndex =
      direction === 'left'
        ? (currentIndex - 1 + cellData.versions.length) %
          cellData.versions.length
        : (currentIndex + 1) % cellData.versions.length;

    cellData.activeIndex = newIndex;
    this.setCellMetadata(cell, cellData);

    // Update the cell's content with the new alternative
    cell.sharedModel.setSource(cellData.versions[newIndex].source);
    this.refreshButtonsCallback();
  }

  /**
   * Switch to the selected alternative
   */
  switchToAlternative(cell: ICellModel, altIndex: number): void {
    const cellData = this.getCellMetadata(cell);
    if (altIndex < 0 || altIndex >= cellData.versions.length) {
      return;
    }

    cellData.activeIndex = altIndex;
    this.setCellMetadata(cell, cellData);

    // Update the cell's content with the new alternative
    cell.sharedModel.setSource(cellData.versions[altIndex].source);
    this.refreshButtonsCallback();
  }

  /**
   * Delete the current alternative version
   */
  deleteAlternative(cell: ICellModel): void {
    const cellData = this.getCellMetadata(cell);
    if (cellData.versions.length <= 1) {
      return;
    }

    const currentIndex = cellData.activeIndex;
    cellData.versions.splice(currentIndex, 1);

    // Adjust index if needed
    if (currentIndex >= cellData.versions.length) {
      cellData.activeIndex = cellData.versions.length - 1;
    }

    this.setCellMetadata(cell, cellData);

    // Update the cell's content with the remaining version
    cell.sharedModel.setSource(cellData.versions[cellData.activeIndex].source);
    this.refreshButtonsCallback();
  }

  /**
   * Get all alternatives for a cell
   */
  getAlternatives(cell: ICellModel): AlternativeVersion[] {
    const cellData = this.getCellMetadata(cell);
    return cellData.versions;
  }

  /**
   * Get the active index for a cell
   */
  getActiveIndex(cell: ICellModel): number {
    const cellData = this.getCellMetadata(cell);
    return cellData.activeIndex;
  }

  /**
   * Check if a cell has alternatives
   */
  hasAlternatives(cell: ICellModel): boolean {
    const cellData = this.getCellMetadata(cell);
    return cellData.versions.length > 1;
  }

  /**
   * Update the current alternative version with edited content
   */
  updateCurrentVersion(cell: ICellModel, newSource: string): void {
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
  }
}
