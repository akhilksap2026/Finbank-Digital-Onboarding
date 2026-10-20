import type { Lang } from '../../../../packages/shared/domain'
// Kirundi strings are a first draft and must be reviewed by a native speaker before go-live (see docs/OPEN_ITEMS.md).
type Dict = Record<string, { fr: string; en: string; rn: string }>
export const T: Dict = {
  appName: { fr: 'Ouverture de compte', en: 'Account opening', rn: 'Kwugurura konti' },
  username: { fr: "Nom d'utilisateur (AD)", en: 'Username (AD)', rn: "Izina ry'ukoresha (AD)" },
  password: { fr: 'Mot de passe', en: 'Password', rn: 'Ijambobanga' },
  login: { fr: 'Se connecter', en: 'Sign in', rn: 'Injira' },
  logout: { fr: 'Se déconnecter', en: 'Sign out', rn: 'Sohoka' },
  lock: { fr: 'Verrouiller', en: 'Lock', rn: 'Kugara' },
  setPin: { fr: 'Définissez un code PIN (6 chiffres) pour cette tablette', en: 'Set a 6-digit PIN for this tablet', rn: 'Shiraho PIN y’imibare 6 kuri iyi tablete' },
  enterPin: { fr: 'Saisissez votre PIN pour déverrouiller', en: 'Enter your PIN to unlock', rn: 'Andika PIN yawe kugira wugurure' },
  confirm: { fr: 'Confirmer', en: 'Confirm', rn: 'Emeza' },
  dashboard: { fr: 'Tableau de bord', en: 'Dashboard', rn: 'Ikibaho' },
  applications: { fr: 'Dossiers', en: 'Applications', rn: 'Amadosiye' },
  newApplication: { fr: 'Nouveau dossier', en: 'New application', rn: 'Idosiye nshasha' },
  approvals: { fr: 'Approbations', en: 'Approvals', rn: 'Kwemeza' },
  workspaces: { fr: 'Espaces de travail', en: 'Workspaces', rn: 'Ibibanza vy’akazi' },
  audit: { fr: "Piste d'audit", en: 'Audit trail', rn: 'Inzira y’isuzuma' },
  admin: { fr: 'Administration', en: 'Administration', rn: 'Ubuyobozi' },
  it: { fr: 'Informatique', en: 'IT', rn: 'Ubuhinga' },
  risk: { fr: 'Risques', en: 'Risk', rn: 'Ingorane' },
  lookup: { fr: 'Recherche client', en: 'Customer lookup', rn: 'Kurondera umukiriya' },
  offline: { fr: 'Hors ligne – les saisies sont chiffrées et mises en file', en: 'Offline – captures are encrypted and queued', rn: 'Nta murongo – ivyo wanditse birabitswe' },
  online: { fr: 'En ligne', en: 'Online', rn: 'Ku murongo' },
  pendingSync: { fr: 'en attente de synchronisation', en: 'pending sync', rn: 'birindiriye guhuzwa' },
  syncNow: { fr: 'Synchroniser', en: 'Sync now', rn: 'Huza ubu' },
  save: { fr: 'Enregistrer', en: 'Save', rn: 'Bika' },
  next: { fr: 'Suivant', en: 'Next', rn: 'Ibikurikira' },
  back: { fr: 'Précédent', en: 'Back', rn: 'Subira inyuma' },
  submit: { fr: 'Soumettre pour approbation', en: 'Submit for approval', rn: 'Rungika kwemezwa' },
  approve: { fr: 'Approuver', en: 'Approve', rn: 'Emeza' },
  returnApp: { fr: 'Retourner pour correction', en: 'Return for correction', rn: 'Subiza gukosorwa' },
  reject: { fr: 'Rejeter', en: 'Reject', rn: 'Kwanka' },
  comment: { fr: 'Commentaire', en: 'Comment', rn: 'Iciyumviro' },
  search: { fr: 'Rechercher', en: 'Search', rn: 'Rondera' },
  status: { fr: 'Statut', en: 'Status', rn: 'Uko bimeze' },
  documents: { fr: 'Documents', en: 'Documents', rn: 'Impapuro' },
  upload: { fr: 'Téléverser', en: 'Upload', rn: 'Shiramwo' },
  pdfPack: { fr: 'Formulaires PDF pré-remplis', en: 'Pre-filled PDF forms', rn: 'Impapuro PDF zuzujwe' },
  required: { fr: 'Obligatoire', en: 'Required', rn: 'Birakenewe' },
  // journey steps
  s_start: { fr: 'Client & type', en: 'Customer & type', rn: 'Umukiriya n’ubwoko' },
  s_account: { fr: 'Compte & produit', en: 'Account & product', rn: 'Konti n’igicuruzwa' },
  s_parties: { fr: 'Titulaires / parties', en: 'Holders / parties', rn: 'Abafise konti' },
  s_entity: { fr: 'Entreprise', en: 'Company', rn: 'Ishirahamwe' },
  s_contact: { fr: 'Adresse & contact', en: 'Address & contact', rn: 'Aho aba n’itumanaho' },
  s_profile: { fr: 'Profil & fonds', en: 'Profile & funds', rn: 'Inkomoko y’amafaranga' },
  s_decl: { fr: 'Déclarations, PEP & référence', en: 'Declarations, PEP & referral', rn: 'Ivyemezo, PEP n’uwamurungitse' },
  s_services: { fr: 'Services', en: 'Services', rn: 'Serivisi' },
  s_mandates: { fr: 'Mandats & opérateurs', en: 'Mandates & operators', rn: 'Abahawe ububasha' },
  s_docs: { fr: 'Documents & scan signé', en: 'Documents & signed scan', rn: 'Impapuro n’isinya' },
  s_review: { fr: 'Vérification & soumission', en: 'Review & submit', rn: 'Gusuzuma no kurungika' },
}
let current: Lang = (localStorage.getItem('fb.lang') as Lang) || 'fr'
export const getLang = () => current
export function setLang(l: Lang) { current = l; localStorage.setItem('fb.lang', l); document.documentElement.lang = l === 'rn' ? 'rn' : l }
export function t(key: keyof typeof T | string, l: Lang = current): string { const e = T[key as string]; return e ? e[l] || e.fr : String(key) }
/** pick a localised value from {fr,en,rn} objects coming from the API */
export function L(v: any, l: Lang = current): string { if (!v) return ''; if (typeof v === 'string') return v; return v[l] || v.fr || v.en || '' }
export const STATUS: Record<string, { fr: string; en: string; rn: string }> = {
  DRAFT: { fr: 'Brouillon', en: 'Draft', rn: 'Igerageza' }, PENDING_BRANCH_HEAD: { fr: 'Chef d’agence', en: 'Branch head', rn: 'Umukuru w’ishami' },
  PENDING_OPERATIONS: { fr: 'Opérations', en: 'Operations', rn: 'Ibikorwa' }, PENDING_COMPLIANCE: { fr: 'Conformité', en: 'Compliance', rn: 'Ukwubahiriza' },
  PENDING_MD: { fr: 'DG', en: 'MD/CEO', rn: 'Umuyobozi mukuru' }, RETURNED: { fr: 'Retourné', en: 'Returned', rn: 'Vyasubijwe' },
  REJECTED: { fr: 'Rejeté', en: 'Rejected', rn: 'Vyanswe' }, APPROVED: { fr: 'Approuvé', en: 'Approved', rn: 'Vyemejwe' },
  ACCOUNT_OPENED: { fr: 'Compte ouvert', en: 'Account opened', rn: 'Konti yuguruwe' }, FALLBACK_MANUAL: { fr: 'Ouverture manuelle', en: 'Manual opening', rn: 'Kwugurura n’intoke' },
}
