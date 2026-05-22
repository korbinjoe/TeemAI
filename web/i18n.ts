import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import zhCommon from './locales/zh/common.json'
import zhHome from './locales/zh/home.json'
import zhSettings from './locales/zh/settings.json'
import zhAgents from './locales/zh/agents.json'
import zhChat from './locales/zh/chat.json'
import zhWorkspace from './locales/zh/workspace.json'
import zhCron from './locales/zh/cron.json'
import zhNotifications from './locales/zh/notifications.json'

import enCommon from './locales/en/common.json'
import enHome from './locales/en/home.json'
import enSettings from './locales/en/settings.json'
import enAgents from './locales/en/agents.json'
import enChat from './locales/en/chat.json'
import enWorkspace from './locales/en/workspace.json'
import enCron from './locales/en/cron.json'
import enNotifications from './locales/en/notifications.json'

import jaCommon from './locales/ja/common.json'
import jaHome from './locales/ja/home.json'
import jaSettings from './locales/ja/settings.json'
import jaAgents from './locales/ja/agents.json'
import jaChat from './locales/ja/chat.json'
import jaWorkspace from './locales/ja/workspace.json'
import jaCron from './locales/ja/cron.json'
import jaNotifications from './locales/ja/notifications.json'

import koCommon from './locales/ko/common.json'
import koHome from './locales/ko/home.json'
import koSettings from './locales/ko/settings.json'
import koAgents from './locales/ko/agents.json'
import koChat from './locales/ko/chat.json'
import koWorkspace from './locales/ko/workspace.json'
import koCron from './locales/ko/cron.json'
import koNotifications from './locales/ko/notifications.json'

import esCommon from './locales/es/common.json'
import esHome from './locales/es/home.json'
import esSettings from './locales/es/settings.json'
import esAgents from './locales/es/agents.json'
import esChat from './locales/es/chat.json'
import esWorkspace from './locales/es/workspace.json'
import esCron from './locales/es/cron.json'
import esNotifications from './locales/es/notifications.json'

import frCommon from './locales/fr/common.json'
import frHome from './locales/fr/home.json'
import frSettings from './locales/fr/settings.json'
import frAgents from './locales/fr/agents.json'
import frChat from './locales/fr/chat.json'
import frWorkspace from './locales/fr/workspace.json'
import frCron from './locales/fr/cron.json'
import frNotifications from './locales/fr/notifications.json'

import deCommon from './locales/de/common.json'
import deHome from './locales/de/home.json'
import deSettings from './locales/de/settings.json'
import deAgents from './locales/de/agents.json'
import deChat from './locales/de/chat.json'
import deWorkspace from './locales/de/workspace.json'
import deCron from './locales/de/cron.json'
import deNotifications from './locales/de/notifications.json'

import ptCommon from './locales/pt/common.json'
import ptHome from './locales/pt/home.json'
import ptSettings from './locales/pt/settings.json'
import ptAgents from './locales/pt/agents.json'
import ptChat from './locales/pt/chat.json'
import ptWorkspace from './locales/pt/workspace.json'
import ptCron from './locales/pt/cron.json'
import ptNotifications from './locales/pt/notifications.json'

const LANGUAGE_KEY = 'openteam:language'

const savedLang = (() => {
  try {
    return localStorage.getItem(LANGUAGE_KEY) || 'en'
  } catch {
    return 'en'
  }
})()

i18n
  .use(initReactI18next)
  .init({
    resources: {
      zh: {
        common: zhCommon,
        home: zhHome,
        settings: zhSettings,
        agents: zhAgents,
        chat: zhChat,
        workspace: zhWorkspace,
        cron: zhCron,
        notifications: zhNotifications,
      },
      en: {
        common: enCommon,
        home: enHome,
        settings: enSettings,
        agents: enAgents,
        chat: enChat,
        workspace: enWorkspace,
        cron: enCron,
        notifications: enNotifications,
      },
      ja: {
        common: jaCommon,
        home: jaHome,
        settings: jaSettings,
        agents: jaAgents,
        chat: jaChat,
        workspace: jaWorkspace,
        cron: jaCron,
        notifications: jaNotifications,
      },
      ko: {
        common: koCommon,
        home: koHome,
        settings: koSettings,
        agents: koAgents,
        chat: koChat,
        workspace: koWorkspace,
        cron: koCron,
        notifications: koNotifications,
      },
      es: {
        common: esCommon,
        home: esHome,
        settings: esSettings,
        agents: esAgents,
        chat: esChat,
        workspace: esWorkspace,
        cron: esCron,
        notifications: esNotifications,
      },
      fr: {
        common: frCommon,
        home: frHome,
        settings: frSettings,
        agents: frAgents,
        chat: frChat,
        workspace: frWorkspace,
        cron: frCron,
        notifications: frNotifications,
      },
      de: {
        common: deCommon,
        home: deHome,
        settings: deSettings,
        agents: deAgents,
        chat: deChat,
        workspace: deWorkspace,
        cron: deCron,
        notifications: deNotifications,
      },
      pt: {
        common: ptCommon,
        home: ptHome,
        settings: ptSettings,
        agents: ptAgents,
        chat: ptChat,
        workspace: ptWorkspace,
        cron: ptCron,
        notifications: ptNotifications,
      },
    },
    lng: savedLang,
    fallbackLng: 'en',
    defaultNS: 'common',
    interpolation: {
      escapeValue: false,
    },
  })

i18n.on('languageChanged', (lng) => {
  try {
    localStorage.setItem(LANGUAGE_KEY, lng)
  } catch { /* ignore */ }
})

export default i18n
