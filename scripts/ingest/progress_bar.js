/**
 * Progress Bar Utility
 * Reusable progress indicator for long-running operations
 */

export class ProgressBar {
  constructor(total, description = 'Processing') {
    this.total = total;
    this.current = 0;
    this.description = description;
    this.startTime = Date.now();
    this.barWidth = 40;
  }

  update(current, customMessage = null) {
    this.current = current;
    const percentage = Math.floor((current / this.total) * 100);
    const filled = Math.floor((current / this.total) * this.barWidth);
    const empty = this.barWidth - filled;
    
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    
    // Calculate ETA
    const elapsed = Date.now() - this.startTime;
    const rate = current / elapsed; // items per ms
    const remaining = this.total - current;
    const eta = remaining / rate;
    
    const etaStr = this.formatTime(eta);
    const elapsedStr = this.formatTime(elapsed);
    
    const message = customMessage || `${current.toLocaleString()} / ${this.total.toLocaleString()}`;
    
    // Clear line and write progress
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
    process.stdout.write(
      `${this.description}: [${bar}] ${percentage}% | ${message} | ${elapsedStr} elapsed | ETA: ${etaStr}`
    );
  }

  increment(customMessage = null) {
    this.update(this.current + 1, customMessage);
  }

  finish(finalMessage = null) {
    this.update(this.total, finalMessage || 'Complete');
    process.stdout.write('\n');
  }

  formatTime(ms) {
    if (isNaN(ms) || ms === Infinity) return '--:--';
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}

// Batch progress bar for operations with batches
export class BatchProgressBar {
  constructor(totalBatches, itemsPerBatch, description = 'Processing batches') {
    this.totalBatches = totalBatches;
    this.itemsPerBatch = itemsPerBatch;
    this.currentBatch = 0;
    this.currentItem = 0;
    this.description = description;
    this.startTime = Date.now();
    this.barWidth = 40;
  }

  updateBatch(batchNum, itemNum = 0) {
    this.currentBatch = batchNum;
    this.currentItem = itemNum;
    
    const totalItems = this.totalBatches * this.itemsPerBatch;
    const processedItems = (batchNum - 1) * this.itemsPerBatch + itemNum;
    const percentage = Math.floor((processedItems / totalItems) * 100);
    const filled = Math.floor((processedItems / totalItems) * this.barWidth);
    const empty = this.barWidth - filled;
    
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    
    // Calculate ETA
    const elapsed = Date.now() - this.startTime;
    const rate = processedItems / elapsed;
    const remaining = totalItems - processedItems;
    const eta = remaining / rate;
    
    const etaStr = this.formatTime(eta);
    const elapsedStr = this.formatTime(elapsed);
    
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
    process.stdout.write(
      `${this.description}: [${bar}] ${percentage}% | Batch ${batchNum}/${this.totalBatches} | ${processedItems.toLocaleString()}/${totalItems.toLocaleString()} items | ${elapsedStr} | ETA: ${etaStr}`
    );
  }

  finish() {
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
    const elapsed = Date.now() - this.startTime;
    const totalItems = this.totalBatches * this.itemsPerBatch;
    console.log(`${this.description}: ✅ Complete | ${totalItems.toLocaleString()} items | ${this.formatTime(elapsed)}`);
  }

  formatTime(ms) {
    if (isNaN(ms) || ms === Infinity) return '--:--';
    
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}
