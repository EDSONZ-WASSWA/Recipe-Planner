const { ObjectId } = require('mongodb');

// Error that is safe to show to API clients (status + message + optional field messages).
class ApiError extends Error {
  constructor(status, message, details = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

// Converts a string from the URL/body into an ObjectId or throws a 400.
function parseObjectId(id, label = 'id') {
  if (typeof id !== 'string' || !/^[0-9a-fA-F]{24}$/.test(id)) {
    throw new ApiError(400, `Invalid ${label}: "${String(id).slice(0, 40)}" is not a valid ObjectId`);
  }
  return new ObjectId(id);
}

module.exports = { ApiError, parseObjectId };
