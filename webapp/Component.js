sap.ui.define([
    "sap/ui/core/UIComponent",
    "com/co/stratesys/zmodproyectos/model/models"
], (UIComponent, models) => {
    "use strict";

    return UIComponent.extend("com.co.stratesys.zmodproyectos.Component", {
        metadata: {
            manifest: "json",
            interfaces: [
                "sap.ui.core.IAsyncContentCreation"
            ]
        },

        init() {

            var oProjectIDModel = new sap.ui.model.json.JSONModel({
               enableTabProjectConsult: true,
               enableTabRolesConsult: true,
               enableTabPackageConsult: true,
               enableTabProject: false,
               enableTabPackage: false,
               enableTabDemandResource: false,
               enableBtnSelCampos: true,
               enableTabRoles: false,
               enableBtnProcess: false,
               indCargaExcel: false,
               enableStatusProy: false,
               totRegProcesar: 0,
               regProcesados: 0
            });
            // call the base component's init function
            UIComponent.prototype.init.apply(this, arguments);

            // set the device model
            this.setModel(models.createDeviceModel(), "device");

            // enable routing
            this.getRouter().initialize();

            this.setModel(oProjectIDModel, "AppModel");
        }
    });
});