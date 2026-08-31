export class AppStore {
    listeners = new Set();
    state = {
        world: null,
        selection: { type: 'planet' },
        camera: { centerX: 0, centerY: 0, zoom: 1 },
    };
    getState() {
        return this.state;
    }
    setWorld(world) {
        this.state = {
            world,
            selection: { type: 'planet' },
            camera: {
                centerX: world.planet.width / 2,
                centerY: world.planet.height / 2,
                zoom: 1,
            },
        };
        this.emit();
    }
    setSelection(selection) {
        this.state = { ...this.state, selection };
        this.emit();
    }
    subscribe(listener) {
        this.listeners.add(listener);
        listener(this.state);
        return () => this.listeners.delete(listener);
    }
    emit() {
        for (const listener of this.listeners)
            listener(this.state);
    }
}
