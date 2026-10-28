/// <reference types="vite/client" />

declare module '*.vue' {
    import type { DefineComponent } from 'vue';
    const composant: DefineComponent<object, object, unknown>;
    export default composant;
}
