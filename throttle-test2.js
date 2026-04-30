const test = `
    scheduleResponseUpdate() {
        if (!this._updatePending) {
            this._updatePending = true;
            setTimeout(() => {
                this.updateResponseContent();
                this._updatePending = false;
            }, 60);
        }
    }
`;
console.log(test);
