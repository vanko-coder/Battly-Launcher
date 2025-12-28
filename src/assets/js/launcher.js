'use strict';

// libs 
const fs = require('fs');
const { Microsoft, Mojang } = require('./assets/js/libs/mc/Index');
const { ipcRenderer } = require('electron');

import { config, logger, changePanel, database, addAccount, accountSelect } from './utils.js';
import Login from './panels/login.js';
import Home from './panels/home.js';
import Settings from './panels/settings.js';
import Welcome from './panels/welcome.js';
import Mods from './panels/mods.js';
import Music from './panels/music.js';
import NewsPanel from './panels/news.js';
import Friends from './panels/friends.js';
import Chat from './panels/chat.js';

class Launcher {
    async init() {
        const loadingText = document.getElementById("loading-text");
        loadingText.innerHTML = "Cargando Panel de Inicio";
        this.initLog();
        console.log("🔄 Avvio del programma di avvio...");
        if (process.platform == "win32") this.initFrame();
        this.config = await config.GetConfig().then(res => res);
        this.news = await config.GetNews().then(res => res);
        this.database = await new database().init();
        this.createPanels(Login, Home, Settings, Welcome, Mods, Music, NewsPanel, Friends, Chat);
        this.getaccounts();
    }

    initLog() {
        document.querySelector(".preload-content").style.display = "block";
        document.addEventListener("keydown", (e) => {
            if (e.ctrlKey && e.shiftKey && e.keyCode == 73 || e.keyCode == 123) {
                ipcRenderer.send("main-window-dev-tools");
            }
        })
        new logger('Launcher', '#3e8ed0')
    }

    initFrame() {
        const loadingText = document.getElementById("loading-text");
        loadingText.innerHTML = "Cargando Panel";
        document.querySelector(".preload-content").style.display = "block";
        console.log("🔄 Fotogramma iniziale...")
        document.querySelector(".frame").classList.toggle("hide")
        document.querySelector(".dragbar").classList.toggle("hide")

        document.querySelector("#minimize").addEventListener("click", () => {
            ipcRenderer.send("main-window-minimize");
        });

        let maximized = false;
        let maximize = document.querySelector("#maximize")
        maximize.addEventListener("click", () => {
            if (maximized) ipcRenderer.send("main-window-maximize")
            else ipcRenderer.send("main-window-maximize");
            maximized = !maximized
            maximize.classList.toggle("icon-maximize")
            maximize.classList.toggle("icon-restore-down")
        });

        document.querySelector("#close").addEventListener("click", () => {
            ipcRenderer.send("main-window-close");
        })
    }

    createPanels(...panels) {
        document.querySelector(".preload-content").style.display = "";
        let panelsElem = document.querySelector(".panels")
        for (let panel of panels) {
            console.log(`🔄 Pannello di partenza ${panel.name}...`);
            let div = document.createElement("div");
            div.classList.add("panel", panel.id)
            div.innerHTML = fs.readFileSync(`${__dirname}/panels/${panel.id}.html`, "utf8");
            panelsElem.appendChild(div);
            new panel().init(this.config, this.news);
        }
    }

    async getaccounts() {
        const loadingText = document.getElementById("loading-text");
        loadingText.innerHTML = "Caricamento account";
        document.querySelector(".preload-content").style.display = "block";
        let accounts = await this.database.getAll('accounts');
        let selectaccount = (await this.database.get('1234', 'accounts-selected'))?.value?.selected;
        console.log(`🔄 Inizia ${accounts.length} conto/i...`);
        

        if (!accounts.length) {
            changePanel("login");
            document.querySelector(".preload-content").style.display = "none";
        } else {
            for (let account of accounts) {
                account = account.value;
                if (account.meta.type === 'Xbox') {
                    console.log(`🔄 Accedere a un account Xbox con il nome utente ${account.name}...`);
                    let refresh = await new Microsoft(this.config.client_id).refresh(account);
                    let refresh_accounts;
                    let refresh_profile;

                    if (refresh.error) {
                        this.database.delete(account.uuid, 'accounts');
                        this.database.delete(account.uuid, 'profile');
                        if (account.uuid === selectaccount) this.database.update({ uuid: "1234" }, 'accounts-selected')
                        console.error(`[Account] ${account.uuid}: ${refresh.errorMessage}`);
                        continue;
                    }

                    refresh_accounts = {
                        access_token: refresh.access_token,
                        client_token: refresh.client_token,
                        uuid: refresh.uuid,
                        name: refresh.name,
                        refresh_token: refresh.refresh_token,
                        user_properties: refresh.user_properties,
                        meta: {
                            type: refresh.meta.type,
                            xuid: refresh.meta.xuid,
                            demo: refresh.meta.demo
                        }
                    }

                    refresh_profile = {
                        uuid: refresh.uuid,
                        skins: refresh.profile.skins || [],
                        capes: refresh.profile.capes || [],
                    }

                    this.database.update(refresh_accounts, 'accounts');
                    this.database.update(refresh_profile, 'profile');
                    addAccount(refresh_accounts);
                    if (account.uuid === selectaccount) accountSelect(refresh.uuid)
                } else if (account.meta.type === 'Mojang') {
                    if (account.meta.offline) {
                        document.querySelector(".preload-content").style.display = "block";
                        console.log(`🔄 Avvio di un account Mojang con il nome utente ${account.name}...`);
                        addAccount(account);
                        if (account.uuid === selectaccount) accountSelect(account.uuid)
                        continue;
                    }

                    let validate = await Mojang.validate(account);
                    if (!validate) {
                        this.database.delete(account.uuid, 'accounts');
                        if (account.uuid === selectaccount) this.database.update({ uuid: "1234" }, 'accounts-selected')
                        console.error(`[Account] ${account.uuid}: Il token non è valido.`);
                        continue;
                    }

                    let refresh = await Mojang.refresh(account);
                    console.log(`🔄 Avvio di un account Mojang con il nome utente ${account.name}...`);
                    let refresh_accounts;

                    if (refresh.error) {
                        this.database.delete(account.uuid, 'accounts');
                        if (account.uuid === selectaccount) this.database.update({ uuid: "1234" }, 'accounts-selected')
                        console.error(`[Account] ${account.uuid}: ${refresh.errorMessage}`);
                        continue;
                    }

                    refresh_accounts = {
                        access_token: refresh.access_token,
                        client_token: refresh.client_token,
                        uuid: refresh.uuid,
                        name: refresh.name,
                        user_properties: refresh.user_properties,
                        meta: {
                            type: refresh.meta.type,
                            offline: refresh.meta.offline
                        }
                    }

                    this.database.update(refresh_accounts, 'accounts');
                    addAccount(refresh_accounts);
                    if (account.uuid === selectaccount) accountSelect(refresh.uuid)
                } else if (account.meta.type === 'cracked') {
                    console.log(`🔄 Avvio di un account Battly con il nome utente ${account.name}...`);
                    addAccount(account);
                    if (account.uuid === selectaccount) accountSelect(account.uuid)
                }
            }




            
            if (!(await this.database.get('1234', 'accounts-selected')).value.selected) {
                let uuid = (await this.database.getAll('accounts'))[0]?.value?.uuid
                if (uuid) {
                    this.database.update({ uuid: "1234", selected: uuid }, 'accounts-selected')
                    accountSelect(uuid)
                }
            }

            if ((await this.database.getAll('accounts')).length == 0) {
                changePanel("login");
                document.querySelector(".preload-content").style.display = "none";
                return
            }

            //comprobar si es la primera vez que se inicia el launcher
            try {
                if (!(await this.database.get('1234', 'first-launch')).value.firstlaunch) {
                    changePanel("login");
                    this.database.update({ uuid: "1234", firstlaunch: true }, 'first-launch')
                }
            } catch (e) {
                changePanel("login");
                this.database.update({ uuid: "1234", firstlaunch: true }, 'first-launch')
            }

            document.querySelector(".preload-content").style.display = "none";
            changePanel("home");
            
        }
    }
}

new Launcher().init();