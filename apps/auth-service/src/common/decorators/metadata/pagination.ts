export function PaginationMetadata(): MethodDecorator {
  return function (
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const { page = '1', size: pageSize = '10' } = args[0];

      const result = await originalMethod.apply(this, args);

      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;

      const paginatedResults = result.data.slice(startIndex, endIndex);

      const metadata = {
        page,
        pageSize,
        totalPages: Math.ceil(result.data.length / pageSize),
        totalRecords: result.data.length,
      };

      return { metadata, results: paginatedResults };
    };

    return descriptor;
  };
}

export function PaginationMetadataUsers(): MethodDecorator {
  return function (
    target: any,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const { page = '1', size: pageSize = '10' } = args[0];

      const result = await originalMethod.apply(this, args);

      const metadata = {
        page,
        pageSize,
        totalPages: Math.ceil(result.data.length / pageSize),
        totalRecords: result.data.length,
      };

      return { metadata, result };
    };

    return descriptor;
  };
}
