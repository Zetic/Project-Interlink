export const RESOURCE_FOCUS_ZOOM = 36;
function regionFocusZoom(world, region) {
    const widthZoom = world.planet.width / Math.max(1, region.bounds.width * 1.35);
    const heightZoom = world.planet.height / Math.max(1, region.bounds.height * 1.35);
    return Math.min(6, Math.max(2, Math.min(widthZoom, heightZoom)));
}
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
    setCamera(camera) {
        this.state = { ...this.state, camera };
        this.emit();
    }
    focusSelection(selection) {
        const world = this.state.world;
        if (!world) {
            this.setSelection(selection);
            return;
        }
        let camera = this.state.camera;
        if (selection.type === 'planet') {
            camera = {
                centerX: world.planet.width / 2,
                centerY: world.planet.height / 2,
                zoom: 1,
            };
        }
        else if (selection.type === 'region') {
            const region = world.planet.regions.find(candidate => candidate.id === selection.regionId);
            if (region) {
                camera = {
                    centerX: region.bounds.x + region.bounds.width / 2,
                    centerY: region.bounds.y + region.bounds.height / 2,
                    zoom: regionFocusZoom(world, region),
                };
            }
        }
        else {
            const resource = world.planet.resourceNodes.find(candidate => candidate.id === selection.resourceNodeId);
            if (resource) {
                camera = {
                    centerX: resource.position.x,
                    centerY: resource.position.y,
                    zoom: RESOURCE_FOCUS_ZOOM,
                };
            }
        }
        this.state = { ...this.state, selection, camera };
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
