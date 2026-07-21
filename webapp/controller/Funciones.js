/*global history */
sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"com/co/stratesys/zmodproyectos/utils/xlsx.full.min",
	"sap/ui/core/routing/History",
	"sap/ui/model/json/JSONModel",
	"sap/m/SearchField",
	"sap/ui/model/type/String",
	"sap/ui/table/Column",
	"sap/m/Column",
	"sap/m/Label",
	"sap/ui/core/Fragment",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/m/Dialog",
	"sap/m/HBox",
	"sap/m/VBox",
	"sap/m/Button",
	"sap/m/Switch",
	"sap/ui/export/Spreadsheet",
	"sap/ui/export/library",
	"sap/m/MessageBox"
], function (Controller, xlsx, History, JSONModel, SearchField, TypeString, UIColumn, MColumn, Label,
	Fragment, Filter, FilterOperator, Dialog, HBox, VBox, Button, Switch,
	Spreadsheet, exportLibrary, MessageBox) {
	"use strict";

	var mUrls = {
		proyectos: "/sap/opu/odata4/sap/zsrv_proyectos/srvd/sap/zsrv_proyectos/0001/QueryProy",
		workPackage: "/sap/opu/odata4/sap/zsrv_proyectos/srvd/sap/zsrv_proyectos/0001/QueryPackage",
		roles: "/sap/opu/odata4/sap/zsrv_proyectos/srvd/sap/zsrv_proyectos/0001/QueryRoles",
		demandResource: "/sap/opu/odata4/sap/zsrv_proyectos/srvd/sap/zsrv_proyectos/0001/QueryDemand"
	};

	var PAGE_SIZE = 100;

	return Controller.extend("com.co.stratesys.zmodproyectos.controller.Funciones", {

		// ════════════════════════════════════════════════════════════════
		//  LIFECYCLE
		// ════════════════════════════════════════════════════════════════

		onInit: async function () {
			this.getView().addEventDelegate({
				onAfterRendering: function () {
					this._suscribirScroll("tablaProyectos", "proyectos");
					this._suscribirScroll("tablaPaquetes", "workPackage");
					this._suscribirScroll("tablaRoles", "roles");
				}.bind(this)
			});

			await this.obtenerDatosIniciales();
		},

		onExit: function () {
			if (this._oDialogSettingsOrd) { this._oDialogSettingsOrd.destroy(); }
		},

		// ════════════════════════════════════════════════════════════════
		//  CARGA DE DATOS
		// ════════════════════════════════════════════════════════════════

		obtenerDatosIniciales: async function () {
			await Promise.all([
				this._cargarPagina("tablaProyectos", "proyectos", mUrls.proyectos, 0),
				this._cargarPagina("tablaPaquetes", "workPackage", mUrls.workPackage, 0),
				this._cargarPagina("tablaRoles", "roles", mUrls.roles, 0),
				this._cargarPagina("tablaDemand", "demandResource", mUrls.demandResource, 0)
			]);
		},

		_cargarPagina: async function (sTablaId, sModelName, sUrl, iSkip) {
			var oTable = this.byId(sTablaId);
			if (!oTable) { return; }

			var sFiltro = this._construirFiltros();
			var sUrlPaginada = sUrl
				+ "?$top=" + PAGE_SIZE
				+ "&$skip=" + iSkip
				+ "&$count=true"
				+ sFiltro;

			var oData = await this.obtenerODataV4(sUrlPaginada);
			if (!oData || !oData.value) { return; }

			var iTotal = oData["@odata.count"] || oData.value.length;
			var bHasMore = oData.value.length === PAGE_SIZE;

			if (iSkip === 0) {
				var oModel = new JSONModel({
					items: oData.value,
					total: iTotal,
					skip: oData.value.length,
					hasMore: bHasMore,
					url: sUrl,
					modelName: sModelName,
					tablaId: sTablaId,
					_loading: false
				});
				oTable.setModel(oModel, sModelName);
			} else {
				var oModelExist = oTable.getModel(sModelName);
				var aActual = oModelExist.getProperty("/items") || [];
				oModelExist.setProperty("/items", aActual.concat(oData.value));
				oModelExist.setProperty("/skip", iSkip + oData.value.length);
				oModelExist.setProperty("/hasMore", bHasMore);
				oModelExist.setProperty("/_loading", false);
			}
		},

		// ════════════════════════════════════════════════════════════════
		//  SCROLL INFINITO
		// ════════════════════════════════════════════════════════════════

		_suscribirScroll: function (sTablaId, sModelName) {
			var oTable = this.byId(sTablaId);
			if (!oTable) {
				console.warn("_suscribirScroll: tabla no encontrada →", sTablaId);
				return;
			}

			var oDomRef = oTable.getDomRef();
			if (!oDomRef) {
				console.warn("_suscribirScroll: DOM no disponible aún →", sTablaId);
				return;  // El onTabSelect lo reintentará cuando el tab sea visible
			}

			var oScroll = this._encontrarScrollable(oDomRef);
			var sKey = "__scrollHandler_" + sModelName;

			if (oScroll[sKey]) {
				oScroll.removeEventListener("scroll", oScroll[sKey]);
			}

			var that = this;
			oScroll[sKey] = function () {
				var iScrollTop = oScroll.scrollTop;
				var iScrollHeight = oScroll.scrollHeight;
				var iClientHeight = oScroll.clientHeight;

				if ((iScrollTop + iClientHeight) / iScrollHeight >= 0.8) {
					that._cargarSiguientePagina(sTablaId, sModelName);
				}
			};

			oScroll.addEventListener("scroll", oScroll[sKey]);
			console.info("Scroll suscrito →", sTablaId);
		},

		_encontrarScrollable: function (oEl) {
			var nodo = oEl.parentElement;
			while (nodo && nodo !== document.body) {
				var sOY = window.getComputedStyle(nodo).overflowY;
				if (sOY === "scroll" || sOY === "auto") { return nodo; }
				nodo = nodo.parentElement;
			}
			return document.documentElement;
		},

		_cargarSiguientePagina: async function (sTablaId, sModelName) {
			var oTable = this.byId(sTablaId);
			if (!oTable) { return; }

			var oModel = oTable.getModel(sModelName);
			if (!oModel) { return; }
			if (!oModel.getProperty("/hasMore")) { return; }
			if (oModel.getProperty("/_loading")) { return; }

			oModel.setProperty("/_loading", true);

			await this._cargarPagina(
				oModel.getProperty("/tablaId"),
				oModel.getProperty("/modelName"),
				oModel.getProperty("/url"),
				oModel.getProperty("/skip")
			);
		},

		// ════════════════════════════════════════════════════════════════
		//  FILTROS
		// ════════════════════════════════════════════════════════════════

		onFilter: async function () {
			await Promise.all([
				this._cargarPagina("tablaProyectos", "proyectos", mUrls.proyectos, 0),
				this._cargarPagina("tablaPaquetes", "workPackage", mUrls.workPackage, 0),
				this._cargarPagina("tablaRoles", "roles", mUrls.roles, 0)
			]);
		},

		_construirFiltros: function () {
			var sProyecto = (this.byId("filterProject") ? this.byId("filterProject").getValue() : "") || "";
			var sEmpresa = (this.byId("filterCompany") ? this.byId("filterCompany").getValue() : "") || "";
			var aParts = [];

			sProyecto = sProyecto.trim();
			sEmpresa = sEmpresa.trim();

			if (sProyecto) { aParts.push("contains(ProjectID,'" + sProyecto + "')"); }
			if (sEmpresa) { aParts.push("contains(ProjectName,'" + sEmpresa + "')"); }

			return aParts.length ? "&$filter=" + aParts.join(" and ") : "";
		},

		// ════════════════════════════════════════════════════════════════
		//  MOSTRAR / OCULTAR COLUMNAS (diálogo propio)
		//
		//  Nota: se reemplazó sap.m.TablePersoController porque NO es
		//  compatible con sap.ui.table.Table (solo con sap.m.Table).
		//  Internamente llamaba a column.getHeader(), método que no
		//  existe en sap.ui.table.Column (sí existe getLabel()), lo que
		//  causaba: "TypeError: e.getHeader is not a function".
		// ════════════════════════════════════════════════════════════════

		onsettingsProyectos: function () {
			this.mostrarOcultarColumnas("tablaProyectos");
		},

		onsettingsProyectosSel: function () {
			this.mostrarOcultarColumnas("tablaProyectosSel");
		},

		onsettingsPaquetes: function () {
			this.mostrarOcultarColumnas("tablaPaquetes");
		},

		onsettingsDemand: function () {
			this.mostrarOcultarColumnas("tablaDemand");
		},

		mostrarOcultarColumnas: function (sTablaId) {
			var oTable = this.byId(sTablaId);
			if (!oTable) { return; }

			var aColumns = oTable.getColumns();
			var that = this;

			if (this._oDialogSettingsOrd) { this._oDialogSettingsOrd.destroy(); }

			this._oDialogSettingsOrd = new Dialog({
				title: "Seleccionar columnas",
				contentWidth: "280px",
				content: new VBox({
					items: aColumns.map(function (col) {
						return new HBox({
							alignItems: "Center",
							items: [
								// sap.ui.table.Column usa la agregación "label" (getLabel()),
								// NO "header" (getHeader() es de sap.m.Column).
								new Label({ text: col.getLabel().getText(), width: "140px" }),
								new Switch({
									state: col.getVisible(),
									change: function (oEvent) {
										col.setVisible(oEvent.getParameter("state"));
									}
								})
							]
						}).addStyleClass("sapUiTinyMargin");
					})
				}),
				buttons: [
					new Button({
						text: "Cerrar",
						press: function () { that._oDialogSettingsOrd.close(); }
					})
				]
			});

			this.getView().addDependent(this._oDialogSettingsOrd);
			this._oDialogSettingsOrd.open();
		},

		// ════════════════════════════════════════════════════════════════
		//  FORMATEADORES
		// ════════════════════════════════════════════════════════════════

		formatDate: function (sDate) {
			if (!sDate) { return ""; }
			var res = sDate.match(/\d+/);
			if (res) {
				var oDateFormat = sap.ui.core.format.DateFormat.getInstance({ pattern: "dd.MM.yyyy" });
				return oDateFormat.format(new Date(parseInt(res[0], 10)));
			}
			return sDate;
		},

		formatoEstadoColor: function (sStatus) {
			switch (sStatus) {
				case "10": return "Information";
				case "Terminado":
				case "COMP": return "Success";
				case "Pendiente":
				case "OPEN": return "Warning";
				case "Error": return "Error";
				default: return "None";
			}
		},

		formatoEstadoTexto: function (sStatus) {
			if (sStatus === "10") { return "En Ejecución"; }
			if (sStatus === "40") { return "Completada"; }
			if (sStatus === "42") { return "Cerrados"; }
			if (sStatus === "00") { return "En planificación"; }
			return sStatus;
		},

		// ════════════════════════════════════════════════════════════════
		//  HTTP
		// ════════════════════════════════════════════════════════════════

		getRouter: function () {
			// return this.getOwnerComponent().getRouter();
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

		onTabSelect: function (oEvent) {
			var sKey = oEvent.getParameter("key");

			// Esperar a que el DOM del tab seleccionado esté renderizado.
			// OJO: las keys deben coincidir con las definidas en la vista
			// (key="proyectos" / "paquetes" / "roles"). Antes decían
			// "info" / "attachments" / "notes" y nunca hacían match.
			setTimeout(function () {
				switch (sKey) {
					case "proyectos":
						this._suscribirScroll("tablaProyectos", "proyectos");
						break;
					case "paquetes":
						this._suscribirScroll("tablaPaquetes", "workPackage");
						break;
					case "roles":
						this._suscribirScroll("tablaRoles", "roles");
						break;
				}
			}.bind(this), 300);
		},

		onLiveSearch: function (oEvent) {
			var sQuery = oEvent.getParameter("newValue") || "";
			this._sLiveSearchQuery = sQuery.trim();

			// Cancelar el timeout anterior si existe
			if (this._iLiveSearchTimer) {
				clearTimeout(this._iLiveSearchTimer);
			}

			// Esperar 300ms antes de hacer la petición
			this._iLiveSearchTimer = setTimeout(function () {
				this._cargarPagina("tablaProyectos", "proyectos", mUrls.proyectos, 0);
			}.bind(this), 300);
		},

		onSelectionProyectos: function () {

			this.onSelectionGenerica("tablaProyectos", "tablaProyectosSel", "proyectos", "/enableTabProject", ["StartDate", "EndDate"]);

		},

		onSelectionDemand: function () {
			this.onSelectionGenerica("tablaDemand", "tablaDemandSel", "demandResource", "/enableTabDemandResource", []);
		},

		onSelectionRoles: function () {
			this.onSelectionGenerica("tablaRoles", "tablaRolesSel", "roles", "/enableTabRoles", []);

		},

		onSelectionPaquetes: function () {

			this.onSelectionGenerica("tablaPaquetes", "tablaPaquetesSel", "workPackage", "/enableTabPackage", ["WPStartDate", "WPEndDate"]);

		},

		onSelectionGenerica: function (sTableId, sTableSelId, sModelName, sAppModelFlag, aDateFields) {
			var aIndices = (this._oSelectedIndices && this._oSelectedIndices[sTableId]) || [];

			if (aIndices.length === 0) {
				MessageBox.warning("No hay filas seleccionadas.");
				return;
			}

			var oAppModel = this.getOwnerComponent().getModel("AppModel");
			oAppModel.setProperty(sAppModelFlag, true);
			oAppModel.setProperty("/enableBtnProcess", true);

			var oTable = this.byId(sTableId);

			var aSelectedItems = aIndices.map(function (iIndex) {
				var oContext = oTable.getContextByIndex(iIndex);
				if (!oContext) { return null; }

				// clona el objeto para no tocar el modelo original
				var oItem = Object.assign({}, oContext.getObject());

				// formatea los campos de fecha indicados, solo en la copia
				(aDateFields || []).forEach(function (sField) {
					oItem[sField] = this.formatFechaOData(oItem[sField]);
				}.bind(this));

				return oItem;
			}.bind(this)).filter(Boolean);

			var oTableSel = this.byId(sTableSelId);
			var oModelSel = oTableSel.getModel(sModelName);

			if (!oModelSel) {
				oModelSel = new JSONModel({ items: [], total: 0 });
				oTableSel.setModel(oModelSel, sModelName);
			}

			var aItemsActuales = oModelSel.getProperty("/items") || [];

			var aIndicesSeleccionados = oTableSel.getSelectedIndices();
			var aIndicesDesmarcados = [];
			for (var i = 0; i < aItemsActuales.length; i++) {
				if (aIndicesSeleccionados.indexOf(i) === -1) {
					aIndicesDesmarcados.push(i);
				}
			}

			var aItemsActualizados = aItemsActuales.concat(aSelectedItems);

			oModelSel.setProperty("/items", aItemsActualizados);
			oModelSel.setProperty("/total", aItemsActualizados.length);

			setTimeout(function () {
				oTableSel.addSelectionInterval(0, aItemsActualizados.length - 1);
				aIndicesDesmarcados.forEach(function (iIndex) {
					oTableSel.removeSelectionInterval(iIndex, iIndex);
				});
			}.bind(this), 100);

			this._bClearingSelection = true;
			oTable.clearSelection();
			this._bClearingSelection = false;

			if (this._oSelectedIndices) {
				this._oSelectedIndices[sTableId] = [];
			}
		},

		// 👇 función auxiliar para convertir /Date(...)/  a dd/MM/yyyy
		formatFechaOData: function (sFecha) {
			if (!sFecha) {
				return "";
			}
			var aMatch = String(sFecha).match(/\d+/);
			if (!aMatch) {
				return sFecha; // ya viene como texto normal, no la toques
			}
			var iTimestamp = parseInt(aMatch[0], 10);
			var oDate = new Date(iTimestamp);

			var oDateFormat = sap.ui.core.format.DateFormat.getDateInstance({ pattern: "dd.MM.yyyy" });
			return oDateFormat.format(oDate);
		},

		onRowSelectionChange: function (oEvent) {
			// Si estamos limpiando, ignorar el evento
			if (this._bClearingSelection) {
				return;
			}

			var oTable = oEvent.getSource();
			var sTableId = oTable.getId().split("--").pop();

			// inicializa el objeto si aún no existe
			if (!this._oSelectedIndices) {
				this._oSelectedIndices = {};
			}
			debugger;
			this._oSelectedIndices[sTableId] = oTable.getSelectedIndices();

		},

		onModificarProyectos: function (oContext) {
			debugger;
			this.onOpenDialog();
		},


		onModificarPaquetes: function (oContext) {
			this.onOpenDialogPaquetes();
		},

		onModificarDemand: function (oContext) {
			this.onOpenDialogDemand();
		},

		onModificarRoles: function (oContext) {
			this.onOpenDialogRoles();
		},

		onOpenDialog: function () {
			//this._oCamposModificados = {}; // resetear campos modificados
			if (!this._oDialogProyecto) {
				this._oDialogProyecto = sap.ui.xmlfragment("com.co.stratesys.zmodproyectos.view.EditarProyecto", this);
				this.getView().addDependent(this._oDialogProyecto);
			}

			this._oDialogProyecto.open();
		},

		onOpenDialogModExe: function () {
			//this._oCamposModificados = {}; // resetear campos modificados
			if (!this._pExecutionModeDialog) {
				this._pExecutionModeDialog = sap.ui.xmlfragment("com.co.stratesys.zmodproyectos.view.ModoEjecucion", this);
				this.getView().addDependent(this._pExecutionModeDialog);
			}

			this._pExecutionModeDialog.open();

		},

		onOpenDialogPaquetes: function () {
			this._oCamposModificadosPaquetes = {}; // resetear campos modificados
			if (!this._oDialogPaquetes) {
				this._oDialogPaquetes = sap.ui.xmlfragment("com.co.stratesys.zmodproyectos.view.EditarPaquetes", this);
				this.getView().addDependent(this._oDialogPaquetes);
			}

			this._oDialogPaquetes.open();

		},

		onModificarDemand: function () {
			this._oCamposModificadosDemand = {}; // resetear campos modificados
			if (!this._oDialogDemand) {
				this._oDialogDemand = sap.ui.xmlfragment("com.co.stratesys.zmodproyectos.view.EditarDemand", this);
				this.getView().addDependent(this._oDialogDemand);
			}

			this._oDialogDemand.open();

		},

		onModificarRoles: function () {
			this._oCamposModificadosRoles = {}; // resetear campos modificados
			if (!this._oDialogRoles) {
				this._oDialogRoles = sap.ui.xmlfragment("com.co.stratesys.zmodproyectos.view.EditarRoles", this);
				this.getView().addDependent(this._oDialogRoles);
			}

			this._oDialogRoles.open();

		},

		onDesmarcarCamposModificados: function (sEntidad, oDialog) {

			// 1. Limpiar el objeto de tracking de esa entidad
			if (this._oCamposModificados && this._oCamposModificados[sEntidad]) {
				this._oCamposModificados[sEntidad] = {};
			}

			// 2. Quitar el resaltado visual de todos los campos del formulario
			if (oDialog) {
				var aControles = oDialog.findAggregatedObjects(true, function (oControl) {
					return oControl.getMetadata().getName() === "sap.m.Input" ||
						oControl.getMetadata().getName() === "sap.m.DatePicker" ||
						oControl.getMetadata().getName() === "sap.m.DateTimePicker";
				});

				aControles.forEach(function (oControl) {
					oControl.setValueState("None");
					oControl.setValueStateText("");
					oControl.setValue("");
				});
			}

		},


		onCerrarDialogProyecto: function () {
			debugger;
			this.onDesmarcarCamposModificados("proyectos", this._oDialogProyecto);
			this._oDialogProyecto.close();
		},

		onCerrarDialogPaquete: function () {
			debugger;
			this.onDesmarcarCamposModificados("paquetes", this._oDialogPaquetes);
			this._oDialogPaquetes.close();
		},

		onCerrarDialogDemand: function () {
			debugger;
			this.onDesmarcarCamposModificados("demands", this._oDialogDemand);
			this._oDialogDemand.close();
		},

		onCerrarDialogRoles: function () {
			debugger;
			this.onDesmarcarCamposModificados("roles", this._oDialogRoles);
			this._oDialogRoles.close();
		},

		onGuardarProyecto: function () {
			// tu lógica de guardado
			this._oDialogProyecto.close();
		},


		onGuardarPaquete: function () {
			// tu lógica de guardado
			this._oDialogPaquetes.close();
		},


		onGuardarDemand: function () {
			// tu lógica de guardado
			this._oDialogDemand.close();
		},

		onGuardarRoles: function () {
			// tu lógica de guardado
			this._oDialogRoles.close();
		},

		onFieldChangeGenerico: function (oEvent, sEntidad) {
			debugger;
			var oSource = oEvent.getSource();
			var oBindingInfo = oSource.getBindingInfo("value") || oSource.getBindingInfo("selected");

			if (oBindingInfo && oBindingInfo.parts && oBindingInfo.parts[0]) {
				var sPath = oBindingInfo.parts[0].path; // ejemplo: "ChangedBy"
				var sNuevoValor = oEvent.getParameter("newValue") || oEvent.getParameter("value");

				// inicializa el objeto de campos modificados por entidad si no existe
				if (!this._oCamposModificados) {
					this._oCamposModificados = {};
				}
				if (!this._oCamposModificados[sEntidad]) {
					this._oCamposModificados[sEntidad] = {};
				}

				// marcar campo como modificado
				this._oCamposModificados[sEntidad][sPath] = sNuevoValor;
				console.log("Campos modificados [" + sEntidad + "]:", this._oCamposModificados[sEntidad]);

				// resaltar el campo visualmente
				oSource.setValueState("Information");
				oSource.setValueStateText("Campo modificado");
			}
		},

		onFieldChange: function (oEvent) {
			this.onFieldChangeGenerico(oEvent, "proyectos");
		},

		onFieldChangePaquetes: function (oEvent) {
			this.onFieldChangeGenerico(oEvent, "paquetes");

		},

		onFieldChangeDemands: function (oEvent) {
			this.onFieldChangeGenerico(oEvent, "demands");

		},
		onFieldChangeRoles: function (oEvent) {
			this.onFieldChangeGenerico(oEvent, "roles");
		},

		onGuardarProyecto: function () {
			if (Object.keys(this._oCamposModificados).length === 0) {
				//	MessageBox.warning("No hay cambios para guardar.");
				//	return;
			}

			//	console.log("Payload a enviar:", this._oCamposModificados);
			// Aquí llamas tu API con solo los campos modificados
			// this._actualizarProyecto(this._oCamposModificados);

			// Limpiar estados visuales
			//this._limpiarValueStates();
			this._oDialogProyecto.close();
		},

		_limpiarValueStates: function () {
			this._oCamposModificados = {};
		},

		onUploadFile: function () {
			if (!this._oDialog) {
				this._oDialog = sap.ui.xmlfragment("com.co.stratesys.zmodproyectos.view.FilterUpload", this);
				this.getView().addDependent(this._oDialog);
			}

			this._oDialog.open();
		},

		closeDialog: function () {
			this._oExcelFile = null;
			this._oDialog.close();
		},

		onProcesarExcel(oEvent) {

			this.getOwnerComponent().getModel("AppModel").setProperty("/enableTabProjectConsult", false);
			this.getOwnerComponent().getModel("AppModel").setProperty("/enableTabRolesConsult", false);
			this.getOwnerComponent().getModel("AppModel").setProperty("/enableTabPackageConsult", false);
			//this.getOwnerComponent().getModel("AppModel").setProperty("/enableBtnSelCampos", false)

			var oFile = this._oExcelFile;

			if (!oFile) {
				sap.m.MessageBox.warning("Seleccione un archivo primero");
				return;
			}

			if (!oFile.name.endsWith(".xlsx")) {
				sap.m.MessageBox.error("El archivo debe ser un Excel (.xlsx)");
				return;
			}

			var oDialog = oEvent.getSource().getParent();
			var oFileUploader = oDialog.findAggregatedObjects(true, function (oObj) {
				return oObj.isA("sap.ui.unified.FileUploader");
			})[0];
			if (oFileUploader) { oFileUploader.clear(); }

			this.getOwnerComponent().getModel("AppModel").setProperty("/enableBtnSelCampos", false);
			this.getOwnerComponent().getModel("AppModel").setProperty("/indCargaExcel", true);
			this.getOwnerComponent().getModel("AppModel").setProperty("/enableStatusProy", false);


			var oReader = new FileReader();

			oReader.onload = async function (e) {
				try {
					var oData = new Uint8Array(e.target.result);
					var totalRegistros = 0;
					var oWorkbook = XLSX.read(oData, { type: "array", cellDates: true });

					// ── 1. PROYECTOS ─────────────────────────────────────────
					var aProyectos = this._parseSheet(oWorkbook, "PROYECTOS", {
						"OPERACION": "Operacion",
						"PROJECT_ID": "ProjectID",
						"PROJECT_NAME": "ProjectName",
						"PROJECT_STAGE": "ProjectStage",
						"START_DATE": "StartDate",
						"END_DATE": "EndDate",
						"PROFIT_CENTER": "ProfitCenter",
						"PROJ_MANAGER_EXT_ID": "ProjManagerExtId",
						"PROJ_ACCOUNTANT_EXT_ID": "ProjAccountantExtId",
						"PROJ_CONTROLLER_EXT_ID": "ProjControllerExtId",
						"PROJ_PARTNER_EXT_ID": "ProjPartnerExtId",
						"RESTRICT_TIME_POSTING": "RestrictTimePosting",
						"CONFIDENTIAL": "Confidential",
						"YY1_ACTIVE_Cpr": "YY1_Active_Cpr",
						"YY1_Geografia_Cpr": "YY1_Geografia_Cpr",
						"YY1_Producto_Cpr": "YY1_Producto_Cpr",
						"YY1_Tipodeproyecto_Cpr": "YY1_Tipodeproyecto_Cpr",
						"YY1_Fechadeventa_Cpr": "YY1_Fechadeventa_Cpr"
					});

					aProyectos.forEach(function (oProyecto) {
						oProyecto.StatusApi = "";
						oProyecto.msjProy = "";
					});

					// ── 2. PAQUETES DE TRABAJO ───────────────────────────────
					var aPaquetes = this._parseSheet(oWorkbook, "PAQUETES_TRABAJO", {
						"OPERACION": "Operacion",
						"PROJECT_ID": "ProjectID",
						"WORK_PACKAGE_ID": "WorkPackageID",
						"WORK_PACKAGE_NAME": "WorkPackageName",
						"WP_START_DATE": "WPStartDate",
						"WP_END_DATE": "WPEndDate",
						"YY1_TipodeproyectoSub_cpd": "YY1_TipodeproyectoSub_cpd"
					});

					// ── 3. DEMANDA DE RECURSOS ───────────────────────────────
					var aDemanda = this._parseSheet(oWorkbook, "DEMANDA_RECURSOS", {
						"OPERACION": "Operacion",
						"EngagementProject": "EngagementProject",
						"WORK_PACKAGE_ID": "WorkPackage",
						"ResourceDemand": "ResourceDemand",
						"EngagementProjectResource": "EngagementProjectResource",
						"Quantity": "Quantity"
					});

					// ── 4. ROLES ─────────────────────────────────────────────
					var aRoles = this._parseSheet(oWorkbook, "ROLES", {
						"OPERACION": "Operacion",
						"PROJECT_ID": "ProjectID",
						"ROLE_ID": "RoleID",
						"RESOURCE_ID": "BusinessPartnerID"
					});

					//PROYECTOS
					if (aProyectos.length > 0) {
						totalRegistros += aProyectos.length;
						this.getOwnerComponent().getModel("AppModel").setProperty("/enableTabProject", true);
						this.getOwnerComponent().getModel("AppModel").setProperty("/enableBtnProcess", true);


						var oTableSel = this.byId("tablaProyectosSel");
						oTableSel.setSelectionMode(sap.m.ListMode.None);
						var oModelSel = oTableSel.getModel("proyectos");

						if (!oModelSel) {
							oModelSel = new JSONModel({ items: [], total: 0 });
							oTableSel.setModel(oModelSel, "proyectos");
						}

						oModelSel.setProperty("/items", aProyectos);
						oModelSel.setProperty("/total", aProyectos.length);


					}

					//PAQUETES
					if (aPaquetes.length > 0) {
						totalRegistros += aPaquetes.length;
						this.getOwnerComponent().getModel("AppModel").setProperty("/enableTabPackage", true);
						this.getOwnerComponent().getModel("AppModel").setProperty("/enableBtnProcess", true);


						var oTableSel = this.byId("tablaPaquetesSel");
						oTableSel.setSelectionMode(sap.m.ListMode.None);
						var oModelPackageSel = oTableSel.getModel("workPackage");

						if (!oModelPackageSel) {
							oModelPackageSel = new JSONModel({ items: [], total: 0 });
							oTableSel.setModel(oModelPackageSel, "workPackage");
						}

						oModelPackageSel.setProperty("/items", aPaquetes);
						oModelPackageSel.setProperty("/total", aPaquetes.length);

					}

					//DEMAND
					if (aDemanda.length > 0) {
						totalRegistros += aDemanda.length;
						this.getOwnerComponent().getModel("AppModel").setProperty("/enableTabDemandResource", true);
						this.getOwnerComponent().getModel("AppModel").setProperty("/enableBtnProcess", true);


						var oTableDemandSel = this.byId("tablaDemandSel");
						oTableDemandSel.setSelectionMode(sap.m.ListMode.None);
						var oModelDemandSel = oTableDemandSel.getModel("demandResource");

						if (!oModelDemandSel) {
							oModelDemandSel = new JSONModel({ items: [], total: 0 });
							oTableDemandSel.setModel(oModelDemandSel, "demandResource");
						}

						oModelDemandSel.setProperty("/items", aDemanda);
						oModelDemandSel.setProperty("/total", aDemanda.length);

					}
					debugger;
					//ROLES
					if (aRoles.length > 0) {
						totalRegistros += aRoles.length;
						this.getOwnerComponent().getModel("AppModel").setProperty("/enableTabRoles", true);
						this.getOwnerComponent().getModel("AppModel").setProperty("/enableBtnProcess", true);


						var oTableRolSel = this.byId("tablaRolesSel");
						oTableRolSel.setSelectionMode(sap.m.ListMode.None);
						var oModelRolSel = oTableRolSel.getModel("roles");

						if (!oModelRolSel) {
							oModelRolSel = new JSONModel({ items: [], total: 0 });
							oTableRolSel.setModel(oModelRolSel, "roles");
						}

						oModelRolSel.setProperty("/items", aRoles);
						oModelRolSel.setProperty("/total", aRoles.length);

					}
					this.getOwnerComponent().getModel("AppModel").setProperty("/totRegProcesar", totalRegistros);
					// ── Setear modelos ────────────────────────────────────────
					//this.getView().getModel("proyectos").setProperty("/items", aProyectos);
					//this.getView().getModel("paquetes").setProperty("/items", aPaquetes);
					//this.getView().getModel("demanda").setProperty("/items", aDemanda);
					//this.getView().getModel("roles").setProperty("/items", aRoles);

					debugger;

					sap.m.MessageToast.show(
						aProyectos.length + " proyectos, " +
						aPaquetes.length + " paquetes, " +
						aDemanda.length + " demandas y " +
						aRoles.length + " roles cargados."
					);

				} catch (err) {
					sap.m.MessageBox.error("Error al procesar el archivo: " + err.message);
				}
			}.bind(this);

			oReader.readAsArrayBuffer(oFile);

			this.closeDialog();
			this.getOwnerComponent().getModel("AppModel").setProperty("/enableBtnProcess", true);

		},

		onConsultar: async function () {
			this.getOwnerComponent().getModel("AppModel").setProperty("/enableTabProjectConsult", true);
			this.getOwnerComponent().getModel("AppModel").setProperty("/enableTabRolesConsult", true);
			this.getOwnerComponent().getModel("AppModel").setProperty("/enableTabPackageConsult", true);
			this.getOwnerComponent().getModel("AppModel").setProperty("/enableTabProject", false);
			this.getOwnerComponent().getModel("AppModel").setProperty("/enableTabPackage", false);
			this.getOwnerComponent().getModel("AppModel").setProperty("/enableTabRoles", false);
			this.getOwnerComponent().getModel("AppModel").setProperty("/enableTabDemandResource", true);
			this.getOwnerComponent().getModel("AppModel").setProperty("/indCargaExcel", false);
			this.getOwnerComponent().getModel("AppModel").setProperty("/enableStatusProy", false);
			await this.obtenerDatosIniciales();
		},



		_parseSheet(oWorkbook, sSheetName, oMapping) {
			var oSheet = oWorkbook.Sheets[sSheetName];
			if (!oSheet) {
				console.warn("Hoja no encontrada: " + sSheetName);
				return [];
			}

			// Leer todas las filas como array de arrays (sin parseo de headers)
			var aRaw = XLSX.utils.sheet_to_json(oSheet, {
				header: 1,          // devuelve array de arrays
				defval: "",         // celdas vacías como string vacío
				raw: false          // fechas y números como string formateado
			});

			// Fila índice 0 → descripción, índice 1 → labels ES, índice 2 → claves técnicas
			if (aRaw.length < 3) {
				console.warn("La hoja " + sSheetName + " no tiene suficientes filas.");
				return [];
			}

			var aHeaders = aRaw[2]; // fila con claves técnicas (OPERACION, PROJECT_ID, ...)
			var aData = aRaw.slice(3); // filas de datos reales

			return aData
				.filter(function (aRow) {
					// Descartar filas completamente vacías
					return aRow.some(function (cell) { return cell !== ""; });
				})
				.map(function (aRow) {
					var oItem = {};
					aHeaders.forEach(function (sHeader, iIdx) {
						var sModelProp = oMapping[sHeader];
						if (sModelProp) {
							oItem[sModelProp] = aRow[iIdx] !== undefined ? String(aRow[iIdx]) : "";
						}
					});
					return oItem;
				});
		},

		onFileChange: function (oEvent) {
			this._oExcelFile = oEvent.getParameter("files")[0];
		},

		onModMasiva: function () {

			this.onOpenDialogModExe();

		},

		ejecutarModificacionMasiva: async function (batch) {

			var oAppModel = this.getOwnerComponent().getModel("AppModel");
			/*
						var oModelProyectos = this.byId("tablaProyectosSel").getModel("proyectos");
						var oModelPaquetes = this.byId("tablaPaquetesSel").getModel("workPackage");
						var oModelDemand = this.byId("tablaDemandSel").getModel("demandResource");
						var oModelRolesSel = this.byId("tablaRolesSel").getModel("roles");
			*/
			var oModelProyectos = this._getOrCreateModel(this.byId("tablaProyectosSel"), "proyectos");
			var oModelPaquetes = this._getOrCreateModel(this.byId("tablaPaquetesSel"), "workPackage");
			var oModelDemand = this._getOrCreateModel(this.byId("tablaDemandSel"), "demandResource");
			var oModelRolesSel = this._getOrCreateModel(this.byId("tablaRolesSel"), "roles");

			if (!this.getOwnerComponent().getModel("AppModel").getProperty("/indCargaExcel")) {

				// filtra cada modelo dejando solo los registros marcados (multitoggle)
				this._filtrarSoloSeleccionados(this.byId("tablaProyectosSel"), oModelProyectos);
				this._filtrarSoloSeleccionados(this.byId("tablaPaquetesSel"), oModelPaquetes);
				this._filtrarSoloSeleccionados(this.byId("tablaDemandSel"), oModelDemand);
				this._filtrarSoloSeleccionados(this.byId("tablaRolesSel"), oModelRolesSel);
				debugger;
				var camposProyectos = this._oCamposModificados["proyectos"];

			}

			// calcula el total de registros a procesar entre todas las tablas
			var iTotalRegistros =
				(oModelProyectos?.getProperty("/items") || []).length +
				(oModelPaquetes?.getProperty("/items") || []).length +
				(oModelDemand?.getProperty("/items") || []).length +
				(oModelRolesSel?.getProperty("/items") || []).length;

			oAppModel.setProperty("/totRegProcesar", iTotalRegistros);
			oAppModel.setProperty("/regProcesados", 0);

			var oBusyDialog = new sap.m.BusyDialog({
				text: "Iniciando modificación masiva...",
				title: "Procesando"
			});
			oBusyDialog.open();

			try {

				await Promise.all([
					this.updateEntidad(oModelProyectos, "ProjectSet", oBusyDialog, batch),
					this.updateEntidad(oModelPaquetes, "WorkPackageSet", oBusyDialog, batch),
					this.updateEntidad(oModelDemand, "ResourceDemandSet", oBusyDialog, batch),
					this.updateEntidad(oModelRolesSel, "RoleSet", oBusyDialog, batch)
				]);

				sap.m.MessageToast.show("Modificación masiva completada");

			} catch (oError) {
				console.error("Error en modificación masiva:", oError);
				sap.m.MessageToast.show("Ocurrió un error durante la modificación");
			} finally {
				oBusyDialog.close();
				oBusyDialog.destroy();
			}
		},
		updateEntidad: async function (oModel, sEntidad, oBusyDialog, batch) {
			debugger;
			var oAppModel = this.getOwnerComponent().getModel("AppModel");
			var totRegProcesar = oAppModel.getProperty("/totRegProcesar");
			var regProcesados = oAppModel.getProperty("/regProcesados");

			var registros = oModel.getProperty("/items") || [];
			if (registros.length === 0) { return; }

			for (var i = 0; i < registros.length; i++) {
				var item = registros[i];

				var itemCamposMod = this.verificarCargaConsulta(item, sEntidad);

				var datosApi = this.setPayloadApi(sEntidad, itemCamposMod);
				var base64 = btoa(datosApi.payload);
				var projectId = item.ProjectID || item.EngagementProject;
				var urlFija = `/sap/opu/odata4/sap/zsrv_project_entry/srvd/sap/zsrv_project_entry/0001/Project('${projectId}')`;

				//EJECUCIÓN EN SEGUNDO PLANO
				if (batch) {
					this.saveItemToBatch(projectId, datosApi.payload, sEntidad, i);
					continue;
				}

				var oPayloadBase64 = {
					projectId: projectId,
					body: base64,
					urlApi: datosApi.url,
					urlMet: '/sap/opu/odata/CPD/SC_EXTERNAL_SERVICES_SRV/$metadata',
					entidad: sEntidad
				};

				var rpta = await this._postODataV4(urlFija, "PATCH", oPayloadBase64);

				if (rpta.numericSeverity === 1) {
					oModel.setProperty("/items/" + i + "/msjProy", "Modificación Efectuada Correctamente");
					oModel.setProperty("/items/" + i + "/StatusApi", "SUCCESS");
				} else {
					oModel.setProperty("/items/" + i + "/msjProy", rpta.mensaje);
					oModel.setProperty("/items/" + i + "/StatusApi", "ERROR");
				}

				var regProcesadosActual = oAppModel.getProperty("/regProcesados") + 1;
				oAppModel.setProperty("/regProcesados", regProcesadosActual);


				// 👇 actualiza el mensaje del busy en vez de un MessageToast por registro
				if (oBusyDialog) {
					oBusyDialog.setText(
						"Procesando: " + regProcesadosActual + " de " + totRegProcesar
					);
					sap.ui.getCore().applyChanges();
					await new Promise(resolve => setTimeout(resolve, 0));
				}
			}

			oModel.refresh(true);
			oAppModel.setProperty("/enableStatusProy", true);
		},

		verificarCargaConsulta: function (item, entidad) {
			var oAppModel = this.getOwnerComponent().getModel("AppModel");
			var indCargaExcel = oAppModel.getProperty("/indCargaExcel");
			debugger;
			if (indCargaExcel) {
				return item;
			} else {

				var itemAux;

				switch (entidad) {
					case "ProjectSet":
						itemAux = this._oCamposModificados["proyectos"];
						itemAux.ProjectID = item.ProjectID;

						break;
					case "WorkPackageSet":
						itemAux = this._oCamposModificados["paquetes"];
						itemAux.ProjectID = item.ProjectID;
						itemAux.WorkPackageID = item.WorkPackageID;
						itemAux.WorkPackageName = item.WorkPackageName;

						break;
					case "ResourceDemandSet":
						itemAux = this._oCamposModificados["demands"];
						itemAux.WorkPackage = item.WorkPackage;
						itemAux.ResourceDemand = item.ResourceDemand;
						break;

					case "RoleSet":
						itemAux = this._oCamposModificados["roles"];
						itemAux.ProjectID = item.ProjectID;
						itemAux.RoleID = item.RoleID;
						break;
				}

				return itemAux;
			}

		},

		setPayloadApi: function (entidad, item) {

			var oPayload = {};

			var infoApi = this.camposApi(entidad, item);

			infoApi.fields.forEach(function (sField) {
				var vValue = item[sField];

				// Omitir si no existe la propiedad
				if (!item.hasOwnProperty(sField)) {
					return;
				}

				// Omitir null, undefined o string vacío (para no mandarlo en el PATCH)
				if (vValue === null || vValue === undefined || vValue === "") {
					return;
				}

				oPayload[sField] = vValue;
			});

			var aDateFields = ["StartDate", "EndDate", "YY1_Fechadeventa_Cpr", "WPStartDate", "WPEndDate"];

			aDateFields.forEach(function (sField) {
				if (oPayload[sField]) {
					oPayload[sField] = this.formatDateToODataString(oPayload[sField]);
				}
			}.bind(this));

			return {
				url: infoApi.url,
				payload: JSON.stringify(oPayload)
			};

		},




		_postODataV4: async function (sEndpoint, method, oBody) {
			return new Promise(function (resolve, reject) {

				// ── 1. Fetch CSRF Token ────────────────────────────────────
				$.ajax({
					url: "/sap/opu/odata4/sap/zsrv_project_entry/srvd/sap/zsrv_project_entry/0001/$metadata",
					method: "GET",
					headers: {
						"X-CSRF-Token": "Fetch"
					},
					success: function (data, status, oXHR) {
						var sToken = oXHR.getResponseHeader("X-CSRF-Token");

						console.log("CSRF Token obtenido:", sToken);

						// ── 2. POST con el token ───────────────────────────
						$.ajax({
							url: sEndpoint,
							method: method,
							contentType: "application/json",
							headers: {
								"X-CSRF-Token": sToken,
								"Accept": "application/json",
								"X-Requested-With": "XMLHttpRequest"
							},
							data: JSON.stringify(oBody),
							success: function (oResponse, sStatus, oXHR) {
								let sMensaje = "Proyecto creado exitosamente";
								let nSeverity = 1;

								try {
									const sSapMessages = oXHR.getResponseHeader("sap-messages");

									if (sSapMessages) {
										const aMessages = JSON.parse(sSapMessages).reverse();
										sMensaje = aMessages.map(function (o) { return o.message; }).join("");
										nSeverity = aMessages[0]?.numericSeverity;
									}

								} catch (e) {
									console.warn("No se pudo parsear sap-messages:", e);
								}

								resolve({
									mensaje: sMensaje,
									numericSeverity: nSeverity,
									id: oResponse?.id || oResponse?.projectId // ✅ retornar el id del proyecto creado
								});
							},
							error: function (oError) {
								console.error("Error en POST:", oError);
								reject(oError);
							}
						});
					},
					error: function (oError) {
						console.error("Error obteniendo CSRF Token:", oError);
						reject(oError);
					}
				});

			});


		},

		camposApi: function (entidad, item) {
			var aFields = [];
			var sEndpoint = "";

			switch (entidad) {
				case "ProjectSet":

					sEndpoint = `/sap/opu/odata/CPD/SC_PROJ_ENGMT_CREATE_UPD_SRV/ProjectSet('${item.ProjectID}')`;

					aFields = [
						"UseProjectBilling",
						"RestrictTimePosting",
						"ProfitCenter",
						"ChangedOn",
						"ProfitCenterName",
						"ProjectID",
						"ProjectName",
						"ProjectStage",
						"StageDesc",
						"StartDate",
						"EndDate",
						"Customer",
						"CustomerName",
						"ProjManagerId",
						"ProjManagerName",
						"ProjAccountantId",
						"ProjAccountantName",
						"ProjControllerId",
						"ProjControllerName",
						"ProjPartnerId",
						"ProjPartnerName",
						"CostCenter",
						"CostCenterName",
						"ProjectCategory",
						"Currency",
						"Currencyname",
						"OrgID",
						"OrgDesc",
						"Confidential",
						"YY1_ACTIVE_Cpr",
						"YY1_Fechadeventa_Cpr",
						"YY1_Fechadeventa_CprF",
						"YY1_Geografia_Cpr",
						"YY1_Geografia_CprF",
						"YY1_Geografia_CprT",
						"YY1_Producto_Cpr",
						"YY1_Producto_CprF",
						"YY1_Producto_CprT",
						"YY1_Tipodeproyecto_Cpr",
						"YY1_Tipodeproyecto_CprF",
						"YY1_Tipodeproyecto_CprT"
					];

					break;

				case "WorkPackageSet":

					sEndpoint = `/sap/opu/odata/CPD/SC_PROJ_ENGMT_CREATE_UPD_SRV/WorkPackageSet(ProjectID='${encodeURIComponent(item.ProjectID)}',WorkPackageID='${encodeURIComponent(item.WorkPackageID)}',WorkPackageName='${encodeURIComponent(item.WorkPackageName)}')`;

					aFields = [
						"WorkPackageUnitText",
						"WorkPackageType",
						"UnitOfMeasure",
						"Quantity",
						"ProjectID",
						"WorkPackageID",
						"WorkPackageName",
						"WPStartDate",
						"WPEndDate",
						"ProjectName",
						"YY1_TipodeproyectoSub_cpd",
						"YY1_TipodeproyectoSub_cpdF",
						"YY1_TipodeproyectoSub_cpdT"
					];

					break;

				case "ResourceDemandSet":

					sEndpoint = `/sap/opu/odata/CPD/SC_PROJ_ENGMT_CREATE_UPD_SRV/A_EngmntProjRsceDmnd(WorkPackage='${encodeURIComponent(item.WorkPackage)}',ResourceDemand='${encodeURIComponent(item.ResourceDemand.padStart(4, '0'))}',Version='1')`;

					aFields = [
						"EngagementProject",
						"WorkItem",
						"BillingControlCategory",
						"DeliveryOrganization",
						"EngagementProjectResourceType",
						"EngagementProjectResource",
						"WorkforcePersonUserID",
						"Country2DigitISOCode",
						"PersonWorkAgreement",
						"ResourceDemandStatus",
						"UnitOfMeasure",
						"Quantity",
						"Currency",
						"DemandCostAmt",
						"DemandRevAmt"
					];

					break;

				case "RoleSet":

					sEndpoint = `/sap/opu/odata/CPD/SC_PROJ_ENGMT_CREATE_UPD_SRV/ProjectRoleSet(ProjectID='${encodeURIComponent(item.ProjectID)}',ProjectRoleID='${encodeURIComponent(item.RoleID)}')`;

					aFields = [
						"ProjectRoleName",
						"BusinessPartnerID",
					];

					break;

				default:
					throw new Error("Entidad desconocida: " + entidad);

			}

			return {
				url: sEndpoint,
				fields: aFields
			};

		},

		formatDateToODataString: function (sDate) {

			if (!sDate) {
				return "";
			}

			// separar fecha y hora si viene con hora incluida
			var aParts = sDate.trim().split(" ");
			var sDatePart = aParts[0];
			var sTimePart = aParts[1] || "00:00:00";

			var aDateSegments = sDatePart.split(".");

			if (aDateSegments.length !== 3) {
				return ""; // formato inesperado
			}

			var sDay = aDateSegments[0].padStart(2, "0");
			var sMonth = aDateSegments[1].padStart(2, "0");
			var sYear = aDateSegments[2];

			return sYear + "-" + sMonth + "-" + sDay + "T" + sTimePart;
		},

		getApiStatusIcon: function (sEstado) {

			switch (sEstado) {
				case "OK":
				case "SUCCESS":
					return "sap-icon://sys-enter-2";       // ✅ verde check
				case "ERROR":
				case "FAILED":
					return "sap-icon://error";              // ❌ error
				case "PENDIENTE":
				case "PENDING":
					return "sap-icon://pending";             // ⏳ reloj
				case "WARNING":
					return "sap-icon://alert";               // ⚠️ alerta
				default:
					return "sap-icon://question-mark";       // desconocido
			}
		},

		getApiStatusColor: function (sEstado) {

			switch (sEstado) {
				case "OK":
				case "SUCCESS":
					return "Positive";
				case "ERROR":
				case "FAILED":
					return "Negative";
				case "PENDIENTE":
				case "PENDING":
					return "Critical";
				case "WARNING":
					return "Critical";
				default:
					return "Default";
			}
		},

		_filtrarSoloSeleccionados: function (oTable, oModel) {
			if (!oTable || !oModel) {
				return;
			}

			var aItems = oModel.getProperty("/items") || [];
			var aIndicesSeleccionados = oTable.getSelectedIndices() || [];

			if (aIndicesSeleccionados.length === 0) {
				return;
			}

			var aItemsFiltrados = aItems.filter(function (oItem, iIndex) {
				return aIndicesSeleccionados.indexOf(iIndex) !== -1;
			});

			oModel.setProperty("/items", aItemsFiltrados);
			oModel.setProperty("/total", aItemsFiltrados.length);
		},

		_getOrCreateModel: function (oTable, sModelName) {
			if (!oTable) {
				return null;
			}

			var oModel = oTable.getModel(sModelName);

			if (!oModel) {
				oModel = new JSONModel({ items: [], total: 0 });
				oTable.setModel(oModel, sModelName);
			}

			return oModel;
		},

		_csrfToken: null,

		_fetchCsrfToken: function () {
			var that = this;
			return new Promise(function (resolve, reject) {
				$.ajax({
					url: "/sap/opu/odata4/sap/zsrv_project_entry/srvd/sap/zsrv_project_entry/0001/$metadata",
					method: "GET",
					headers: { "X-CSRF-Token": "Fetch" },
					success: function (data, status, oXHR) {
						that._csrfToken = oXHR.getResponseHeader("X-CSRF-Token");
						resolve(that._csrfToken);
					},
					error: function (oError) {
						reject(oError);
					}
				});
			});
		},

		_csrfToken: null,

		_getCsrfToken: function () {
			if (this._csrfToken) {
				return Promise.resolve(this._csrfToken);
			}
			return this._fetchCsrfToken();
		},

		_isCsrfError: function (oError) {
			// 403 con header específico de CSRF inválido/expirado
			return oError && oError.status === 403 &&
				(oError.getResponseHeader("X-CSRF-Token") === "Required" ||
					/csrf/i.test(oError.responseText || ""));
		},

		_postODataCSRF: async function (sEndpoint, method, oBody) {
			var that = this;
			var sToken = await this._getCsrfToken();

			var doRequest = function (sTokenToUse) {
				return new Promise(function (resolve, reject) {
					$.ajax({
						url: sEndpoint,
						method: method,
						contentType: "application/json",
						headers: {
							"X-CSRF-Token": sTokenToUse,
							"Accept": "application/json",
							"X-Requested-With": "XMLHttpRequest"
						},
						data: JSON.stringify(oBody),
						success: function (oResponse, sStatus, oXHR) {
							let sMensaje = "Proyecto creado exitosamente";
							let nSeverity = 1;

							try {
								const sSapMessages = oXHR.getResponseHeader("sap-messages");
								if (sSapMessages) {
									const aMessages = JSON.parse(sSapMessages).reverse();
									sMensaje = aMessages.map(function (o) { return o.message; }).join("");
									nSeverity = aMessages[0]?.numericSeverity;
								}
							} catch (e) {
								console.warn("No se pudo parsear sap-messages:", e);
							}

							resolve({
								mensaje: sMensaje,
								numericSeverity: nSeverity,
								id: oResponse?.id || oResponse?.projectId
							});
						},
						error: function (oError) {
							reject(oError);
						}
					});
				});
			};

			try {
				return await doRequest(sToken);
			} catch (oError) {
				// Si falló por token, invalidamos, pedimos uno nuevo y reintentamos UNA vez
				if (that._isCsrfError(oError)) {
					console.warn("Token CSRF inválido/expirado. Reintentando...");
					that._csrfToken = null;

					try {
						var sNewToken = await that._fetchCsrfToken();
						return await doRequest(sNewToken);
					} catch (oRetryError) {
						console.error("Falló también el reintento con nuevo token:", oRetryError);
						throw oRetryError;
					}
				}

				// Si no fue error de token, propaga el error normal
				console.error("Error en POST:", oError);
				throw oError;
			}
		},

		onExecuteDialog: function () {
			this._closeExecutionModeDialog();
			this._executeInDialog();
		},

		onExecuteBackground: function () {
			this._closeExecutionModeDialog();
			this._executeInBackground();
		},

		_closeExecutionModeDialog: function () {
			this._pExecutionModeDialog.close();
		},

		_executeInDialog: function () {

			MessageBox.confirm("¿Está seguro de ejecutar las modificaciones en Dialogo ?", {
				title: "Confirmación",
				onClose: function (oAction) {
					if (oAction === MessageBox.Action.OK) {
						this.ejecutarModificacionMasiva(false);
					} else {
					}
				}.bind(this)
			});

		},

		_executeInBackground: function () {
			MessageBox.confirm("¿Está seguro que desea ejecutar las modificaciones en segundo plano?", {
				title: "Confirmación",
				onClose: function (oAction) {
					if (oAction === MessageBox.Action.OK) {
						this.ejecutarModificacionMasiva(true);
					} else {
					}
				}.bind(this)
			});
		},

		_batchBuffer: [],
		_batchSize: 2,
		_urlApiBatch: "/sap/opu/odata4/sap/zsrv_project_update/srvd/sap/zi_srv_proyectos_update/0001",

		saveItemToBatch: async function (projectId, payload, entidad, cantItems) {

			var body = JSON.stringify(payload)
			// Construye el body con los 5 campos clave + Body
			var oBody = {
				ProjectId: "1",      // string, max 10
				Api: "prueba",             // string, max 20
				Datum: "2026-07-16",       // Edm.Date
				Zeit: "17:31:00",          // Edm.TimeOfDay
				Uname: "USUARIO01",        // string, max 12
				Body: body,                // string, sin límite explícito
				Status: "A",               // string, max 1
				Msj: "Mensaje inicial"     // string, max 100
			};

				var sId = "r" + (this._batchBuffer.length + 1);
			this._batchBuffer.push({
				id: sId,
				atomicityGroup: sId,  
				method: "POST",
				url: "Proyectos", // ej: "Mensaje" (el alias de tu proyección)
				headers: { "Content-Type": "application/json" },
				body: oBody
			});

			cantItems += 1;
			var bEsMultiplo = (cantItems % this._batchSize === 0) && cantItems > 0;

			if (bEsMultiplo) {
				debugger;
				var aLoteAEnviar = this._batchBuffer;
				this._batchBuffer = [];

				try {
					var oResultado = await this._postBatchODataV4(this._urlApiBatch, aLoteAEnviar);
					console.log(`Lote de ${aLoteAEnviar.length} items enviado. OK: ${oResultado.totalOk}, Errores: ${oResultado.totalError}`);
					return oResultado;
				} catch (oError) {
					console.error("Error enviando lote:", oError);
					throw oError;
				}
			}

			return null;
		},

		flushBatchBuffer: async function () {
			if (this._batchBuffer.length === 0) {
				return null;
			}

			var aLoteAEnviar = this._batchBuffer;
			this._batchBuffer = [];

			try {
				var oResultado = await this._postBatchODataV4(this._serviceRoot, aLoteAEnviar);
				console.log(`Lote final de ${aLoteAEnviar.length} items enviado. OK: ${oResultado.totalOk}, Errores: ${oResultado.totalError}`);
				return oResultado;
			} catch (oError) {
				console.error("Error enviando lote final:", oError);
				throw oError;
			}
		},

		_postBatchODataV4: async function (sServiceRoot, aRequests) {
			var that = this;
			var sToken = await this._getCsrfToken();
			var oBatchBody = { requests: aRequests };

			var doRequest = function (sTokenToUse) {
				return new Promise(function (resolve, reject) {
					$.ajax({
						url: sServiceRoot + "/$batch",
						method: "POST",
						contentType: "application/json",
						headers: {
							"X-CSRF-Token": sTokenToUse,
							"Accept": "application/json",
							"X-Requested-With": "XMLHttpRequest"
						},
						data: JSON.stringify(oBatchBody),
						success: function (oResponse) {
							resolve(that._parseBatchResponse(oResponse));
						},
						error: function (oError) {
							reject(oError);
						}
					});
				});
			};

			try {
				return await doRequest(sToken);
			} catch (oError) {
				if (that._isCsrfError(oError)) {
					that._csrfToken = null;
					var sNewToken = await that._fetchCsrfToken();
					return await doRequest(sNewToken);
				}
				throw oError;
			}
		},

		_parseBatchResponse: function (oResponse) {
			var aResponses = oResponse.responses || [];
			var aExitosos = [];
			var aFallidos = [];

			aResponses.forEach(function (oResp) {
				var bOk = oResp.status >= 200 && oResp.status < 300;
				var oResult = { id: oResp.id, status: oResp.status, body: oResp.body };
				bOk ? aExitosos.push(oResult) : aFallidos.push(oResult);
			});

			return {
				exitosos: aExitosos,
				fallidos: aFallidos,
				totalOk: aExitosos.length,
				totalError: aFallidos.length
			};
		}

	});
});