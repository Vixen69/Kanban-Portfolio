# vendor/ — tarballs pour installation hors-ligne

Rituel avant chaque traversée vers la machine côté client :

```bash
npm run vendor   # remplit vendor/ avec les tarballs du lock
bash verify.sh   # rejoue l'install hors-ligne depuis vendor/ + toute la chaîne
```

Après la traversée : comparaison sha256 fichier par fichier.
Les tarballs ne sont pas encore versionnés (décision « canal d'entrée
côté client » ouverte, CLAUDE.md §12).
