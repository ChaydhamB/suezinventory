import { createContext, useContext } from "react";

export type NavCtx = {
  goToStock: (search?: string) => void;
  isAdmin: boolean;
};

export const NavContext = createContext<NavCtx>({
  goToStock: () => {},
  isAdmin: true,
});

export const useNav = () => useContext(NavContext);
