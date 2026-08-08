// Installs the browser Buffer polyfill required by the Algorand x402 client.
import "@/lib/x402/buffer-polyfill";
import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { logBuildInfo } from "@/lib/build-info";
import { routeTree } from "./routeTree.gen";

logBuildInfo();


export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
