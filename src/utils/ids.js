import { ObjectId } from 'mongodb';

export function isValidId(id) {
    return ObjectId.isValid(id);
}

export function toId(id) {
    return new ObjectId(id);
}

export function idToString(id) {
    return id ? id.toString() : null;
}