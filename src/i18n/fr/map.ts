import type { Strings } from '../en';

/** Strings of the map home: MapSheet browse, search and stop modes, banners and map controls (English keys in ../en/map.ts). */
export const map: Partial<Strings> = {
  // Map controls and overlays
  'map.control.locate': 'Afficher ma position',
  'map.control.locateDenied': 'Localisation désactivée. Ouvrir la configuration',
  'map.control.credits': 'Crédits de la carte',
  'map.zoomHint': 'Zoomez pour voir tous les arrêts',
  'map.offline': 'Hors ligne · arrêts et alarmes fonctionnent',
  'map.firstOffline': 'La carte nécessite internet la première fois. La recherche et les alarmes fonctionnent hors ligne.',
  'map.pinCrosshair': 'Position du repère',

  // Update required (below the server's minimum version; alarms keep working)
  'map.update.body': 'Mettez StopWake à jour. Vos alarmes continuent de fonctionner.',
  'map.update.action': 'Mettre à jour',
  'map.announcement.open': 'En savoir plus',

  // Country pack suggestion
  'map.pack.title': 'Arrêts · {country} · {size}',
  'map.pack.body': 'Téléchargez-les pour trouver les arrêts d’ici, même sans internet.',
  'map.pack.download': 'Télécharger',
  'map.pack.downloading': 'Téléchargement {percent} %',
  'map.pack.installing': 'Installation…',
  'map.pack.failed': 'Le téléchargement s’est interrompu. Réessayez.',
  'map.pack.hint': 'Vous cherchez des arrêts ({country}) ? Téléchargez-les ({size}).',

  // Browse mode
  'map.nearby.title': 'Arrêts à proximité',
  'map.nearby.within': 'Dans un rayon de {distance}',
  'map.nearby.showAll': 'Tout afficher à proximité',
  'map.nearby.showFewer': 'Afficher moins',
  'map.nearby.emptyTitle': 'Aucun arrêt à proximité',
  'map.nearby.emptyBody': 'Cherchez plutôt votre destination.',
  'map.location.title': 'Voir les arrêts près de vous',
  'map.location.body': 'Autorisez la localisation pour lister les arrêts autour de vous.',
  'map.location.allow': 'Autoriser la localisation',
  'map.location.deniedBody': 'La localisation est désactivée pour StopWake. Activez-la pour lister les arrêts autour de vous.',
  'map.location.openSetup': 'Ouvrir la configuration',
  'map.longPressHint': 'Appuyez longuement sur la carte pour placer un repère n’importe où.',

  // Search mode
  'map.search.leaveHere': 'Sonner quand je pars d’ici',
  'map.search.leaveHereBody': 'Vous réveille dès que vous vous éloignez de votre position actuelle',
  'map.search.dropPin': 'Placer un repère sur la carte',
  'map.search.tip': 'Astuce : collez des coordonnées ou un lien Google Maps.',
  'map.search.stops': 'Arrêts',
  'map.search.addressesOffline': 'Les adresses nécessitent internet. Les arrêts fonctionnent hors ligne.',
  'map.search.noResultsTitle': 'Aucun résultat pour « {query} »',
  'map.search.noResultsBody': 'Vérifiez l’orthographe ou ajoutez la ville, par exemple « Bahnhofstraße Ulm ».',
  'map.search.recentsCleared': 'Arrêts récents effacés',
  'map.search.undo': 'Annuler',

  // Pin mode (drop a pin without long-press)
  'map.pin.title': 'Déplacez la carte pour placer le repère',
  'map.pin.finding': 'Recherche de l’adresse…',
  'map.pin.use': 'Utiliser cet endroit',

  // Stop mode
  'map.stop.minutes': '{minutes} min',
  'map.stop.trainWarning': 'En train, {distance}, ce n’est que quelques secondes. Réveil 2 min avant plutôt ?',
  'map.stop.useTwoMinutes': 'Passer à 2 min',
  'map.stop.options': 'Options de l’alarme',
  'map.stop.optionsArrive': 'Arrivée',
  'map.stop.optionsLeave': 'Départ',
  'map.stop.whenLabel': 'Quand l’alarme sonne',
  'map.stop.strengthLabel': 'Intensité de l’alarme',
  'map.stop.demo': 'Essayer un trajet démo',
  'map.stop.demoBody': 'Une simulation d’une minute pour voir et entendre l’alarme.',
  'map.stop.switch': 'Basculer l’alarme sur cet arrêt',
  'map.stop.saved': 'Ajouté aux favoris',
  'map.stop.removed': 'Retiré des favoris',
  'map.stop.notFound': 'Cet arrêt ne fait pas partie des arrêts de ce téléphone.',

  // The rule line (also on the Trip screen)
  'map.rule.time': 'Sonne environ {minutes} min avant votre arrivée',
  'map.rule.distance': 'Sonne {distance} avant l’arrêt',
  'map.rule.leave': 'Sonne quand vous êtes à plus de {distance}',
};
