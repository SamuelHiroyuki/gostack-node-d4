import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Product from '@modules/products/infra/typeorm/entities/Product';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

interface IValidation {
  nonExistentProducts: {
    first: null | string;
    quantity: number;
  };
  invalidQuantityProducts: {
    first: null | string;
    quantity: number;
  };
  sanitizedProducts: Array<{
    product_id: string;
    quantity: number;
    price: number;
  }>;
  productsToUpdate: Product[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,
    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,
    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) { }

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customer = await this.customersRepository.findById(customer_id);

    if (!customer) {
      throw new AppError('Customer not found.');
    }

    if (!products.length) {
      throw new AppError('Less than one product to create an order.');
    }

    const existingProducts = await this.productsRepository.findAllById(
      products,
    );

    const {
      invalidQuantityProducts,
      nonExistentProducts,
      sanitizedProducts,
      productsToUpdate,
    } = products.reduce(
      (acc, product) => {
        const matchProduct = existingProducts.find(p => p.id === product.id);
        if (matchProduct) {
          if (product.quantity > matchProduct.quantity) {
            acc.invalidQuantityProducts.first = product.id;
            acc.invalidQuantityProducts.quantity += 1;
          } else {
            acc.productsToUpdate.push({
              ...matchProduct,
              quantity: matchProduct.quantity - product.quantity,
            });
            acc.sanitizedProducts.push({
              product_id: product.id,
              quantity: product.quantity,
              price: matchProduct.price,
            });
          }
        } else {
          acc.nonExistentProducts.first = product.id;
          acc.nonExistentProducts.quantity += 1;
        }

        return acc;
      },
      {
        nonExistentProducts: {
          first: null,
          quantity: 0,
        },
        invalidQuantityProducts: {
          first: null,
          quantity: 0,
        },
        sanitizedProducts: [],
        productsToUpdate: [],
      } as IValidation,
    );

    if (nonExistentProducts.first) {
      throw new AppError(
        `Could not find product_id '${nonExistentProducts.first}'${nonExistentProducts.quantity > 1
          ? ` and others (${nonExistentProducts.quantity - 1}) products.`
          : '.'
        }`,
      );
    }

    if (invalidQuantityProducts.first) {
      throw new AppError(
        `The given quantity for the product '${invalidQuantityProducts.first
        }' is not available.${invalidQuantityProducts.quantity > 1
          ? ` Another (${invalidQuantityProducts.quantity - 1
          }) products also exceed the quantity available.`
          : ''
        }`,
      );
    }

    const order = await this.ordersRepository.create({
      customer,
      products: sanitizedProducts,
    });

    await this.productsRepository.updateQuantity(productsToUpdate);

    return order;
  }
}

export default CreateOrderService;
