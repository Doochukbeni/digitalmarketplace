"use client";

import { useEffect, useState } from "react";
import { Button } from "./ui/Button";
import { useCart } from "@/hooks/use-cart";
import { Product } from "@/payload-types";

const AddToCartButton = ({ product }: { product: Product }) => {
  const { addItem } = useCart();
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  useEffect(() => {
    const timeOut = setTimeout(() => {
      setIsSuccess(false);
    }, 2000);

    return () => clearTimeout(timeOut);
  }, [isSuccess]);
  return (
    <Button
      onClick={() => {
        addItem(product);
        setIsSuccess(true);
      }}
      size="lg"
      className="w-full"
    >
      {isSuccess ? "Added to cart" : "Add to cart"}
    </Button>
  );
};

export default AddToCartButton;
