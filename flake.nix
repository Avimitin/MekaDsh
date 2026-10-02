{
  description = "mekadsh: a DeepSeek Harness style web interface for the meka agent daemon";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      packages = forAllSystems (pkgs: {
        default = pkgs.buildNpmPackage {
          pname = "mekadsh";
          version = "0.1.0";
          src = ./.;

          npmDepsHash = "sha256-oLDAaq8cOTMVWIJ3Eqc3+3EL1gZdk6n4PdsbxhPK+hw=";

          # `npm run build` typechecks (tsc --noEmit) and bundles with vite.
          npmBuildScript = "build";

          # The site is fully static; the flake package is the dist/ tree.
          installPhase = ''
            runHook preInstall
            cp -r dist $out
            runHook postInstall
          '';
        };
      });

      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages = [
            pkgs.nodejs_24
          ];
        };
      });
    };
}
