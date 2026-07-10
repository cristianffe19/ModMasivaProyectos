sap.ui.define([
    "com/co/stratesys/zmodproyectos/controller/Funciones"
], (Funciones) => {
    "use strict";

    return Funciones.extend("com.co.stratesys.zmodproyectos.controller.Principal", {

onInit: async function () {
    this.getView().addEventDelegate({
        onAfterRendering: function () {
            if (!this._bPersoInitialized) {
                this._bPersoInitialized = true;
                this._oTPC_Proyectos = this._initTablePerso("tablaProyectos", "proyectosTable");
                this._oTPC_Paquetes  = this._initTablePerso("tablaPaquetes",  "paquetesTable");
            }

            // ── Suscribir scroll al contenedor de cada tabla ───
            this._suscribirScroll("tablaProyectos", "proyectos",
                "/sap/opu/odata4/sap/zsrv_proyectos/srvd/sap/zsrv_proyectos/0001/QueryProy");
            this._suscribirScroll("tablaPaquetes", "workPackage",
                "/sap/opu/odata4/sap/zsrv_proyectos/srvd/sap/zsrv_proyectos/0001/QueryPackage");
            this._suscribirScroll("tablaRoles", "roles",
                "/sap/opu/odata4/sap/zsrv_proyectos/srvd/sap/zsrv_proyectos/0001/QueryRoles");

        }.bind(this)
    });

    await this.obtenerDatosIniciales();
},

        obtenerODataV4: async function (url) {
            try {
                var response = await fetch(url, {
                    method: "GET",
                    headers: { "Accept": "application/json" }
                });
                return await response.json();
            } catch (error) {
                console.error("Fallo en la petición:", error);
                return null;
            }
        },

        formatoEstadoColor: function (sStatus) {
            switch (sStatus) {
                case "10":   return "Information";
                case "Terminado":
                case "COMP": return "Success";
                case "Pendiente":
                case "OPEN": return "Warning";
                case "Error": return "Error";
                default:      return "None";
            }
        },

        formatoEstadoTexto: function (sStatus) {
            if (sStatus === "10") { return "En Ejecución"; }
            if (sStatus === "40") { return "Completada"; }
            if (sStatus === "42") { return "Cerrados"; }
            if (sStatus === "00") { return "En planificación"; }
            return sStatus;
        }
    });
});