export function compositionTotal(composition) {
    return composition.reduce((total, component) => total + component.massFraction, 0);
}
