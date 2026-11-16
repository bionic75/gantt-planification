/** Erreur métier dont le message peut être renvoyé tel quel au client */
export class HttpError extends Error {
    status: number;
    /** Champs supplémentaires de la réponse JSON */
    body: Record<string, unknown> | undefined;
    expose: boolean;

    constructor(status: number, message: string, body?: Record<string, unknown>) {
        super(message);
        this.status = status;
        this.body = body;
        this.expose = true;
    }
}

export const badRequest = (message: string) => new HttpError(400, message);
export const unauthorized = (message: string) => new HttpError(401, message);
export const forbidden = (message: string) => new HttpError(403, message);
export const notFound = (message: string) => new HttpError(404, message);
