// @ts-check

/** Erreur métier dont le message peut être renvoyé tel quel au client */
export class HttpError extends Error {
    /**
     * @param {number} status
     * @param {string} message
     * @param {Record<string, unknown>} [body] champs supplémentaires de la réponse JSON
     */
    constructor(status, message, body) {
        super(message);
        this.status = status;
        this.body = body;
        this.expose = true;
    }
}

export const badRequest = (/** @type {string} */ message) => new HttpError(400, message);
export const unauthorized = (/** @type {string} */ message) => new HttpError(401, message);
export const forbidden = (/** @type {string} */ message) => new HttpError(403, message);
export const notFound = (/** @type {string} */ message) => new HttpError(404, message);
