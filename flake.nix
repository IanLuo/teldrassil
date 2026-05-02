{
  description = "Teldrassil: Modular Agentic Micro-Kernel Framework";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            nodejs_20
            pnpm_9
            typescript-language-server
            prettierd
          ];

          shellHook = ''
            echo "🌳 Welcome to the Teldrassil Development Environment 🌳"
            echo "Node version: $(node --version)"
            echo "pnpm version: $(pnpm --version)"
            
            # Setup pnpm to use the local workspace
            export PNPM_HOME="$PWD/.pnpm-store"
            export PATH="$PNPM_HOME:$PATH"
          '';
        };
      }
    );
}
