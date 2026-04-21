# Stabilization Notes

Cette passe intermediaire vise surtout la stabilisation ergonomique et fonctionnelle avant la grande refonte visuelle.

## Corrections apportees

### Globe

- zoom et dezoom rendus beaucoup plus amples
- capture native de la molette sur le globe avec `preventDefault`, pour eviter le scroll de page pendant la manipulation
- inertie douce sur rotation et zoom pour une sensation plus instrumentale
- focus clavier/pointer explicite sur le globe
- raccourcis de navigation ajoutes: fleches, `+`, `-`, `R`
- zone du globe agrandie, recentree et legerement mieux mise en valeur
- rendu un peu plus net avec ring, focus state et precision geometrique

### Briques

- selection de brique reliee a la couche correspondante
- le globe met maintenant en avant la couche selectionnee et attenue le reste du contexte
- labels et emphases ajoutes sur flux, trajectoires, halos et pulses quand une brique est selectionnee
- distinction plus claire des statuts de briques via accents de couleur coherents
- detail de brique rendu plus explicite sur l'effet produit dans le globe

### Temps

- modes explicites ajoutes: `Pause`, `Temps reel`, `Accelere`
- position temporelle reliee a des moments nommes du cycle simule 2026
- comparaison N / N-1 rendue plus lisible par un libelle clair
- le slider met maintenant la lecture en pause pour eviter une sensation arbitraire

### Ergonomie generale

- sidebars rendues plus stables avec scroll interne sur grand ecran
- reduction des ambiguities entre contexte global et couche focalisee
- architecture preservee: composants existants renforces plutot que remplaces

## Points prepares pour la prochaine grande passe

- systeme de couleurs par domaine et statut reutilisable
- composant globe pret pour enrichissement visuel futur
- logique de focus de brique exploitable pour une future narration visuelle plus ambitieuse
