class APIFeatures {
  constructor(query, queryString) {
    this.query = query;           // Mongoose query (e.g., Question.find({ organizationId }))
    this.queryString = queryString; // req.query object from URL
  }

  // 1. Text Search across specific fields
  search(searchableFields = []) {
    if (this.queryString.search && searchableFields.length > 0) {
      const regex = new RegExp(this.queryString.search, 'i');
      const searchConditions = searchableFields.map(field => ({ [field]: regex }));
      this.query = this.query.find({ $or: searchConditions });
    }
    return this;
  }

  // 2. Exact Filtering (excluding reserved keys like page, sort, limit)
  filter() {
    const queryObj = { ...this.queryString };
    const excludedFields = ['page', 'sort', 'limit', 'fields', 'search'];
    excludedFields.forEach(el => delete queryObj[el]);

    // Advanced filtering for range operators (gte, gt, lte, lt)
    let queryStr = JSON.stringify(queryObj);
    queryStr = queryStr.replace(/\b(gte|gt|lte|lt)\b/g, match => `$${match}`);

    this.query = this.query.find(JSON.parse(queryStr));
    return this;
  }

  // 3. Sorting (e.g., sortBy=-createdAt or sortBy=name)
  sort() {
    if (this.queryString.sortBy) {
      const sortBy = this.queryString.sortBy.split(',').join(' ');
      this.query = this.query.sort(sortBy);
    } else {
      this.query = this.query.sort('-createdAt'); // Default: Newest first
    }
    return this;
  }

  // 4. Pagination (Batching)
  paginate() {
    const page = parseInt(this.queryString.page, 10) || 1;
    const limit = parseInt(this.queryString.limit, 10) || 20; // Default 20 per page
    const skip = (page - 1) * limit;

    this.query = this.query.skip(skip).limit(limit);
    return this;
  }
}

module.exports = APIFeatures;