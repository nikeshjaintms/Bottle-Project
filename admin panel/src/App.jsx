import { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { logoutUser } from './redux/slices/loginSlice';
import { AbilityContext } from './context/AbilityContext';
import { defineAbilitiesFor } from './abilities';

import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import Dashboard from './pages/system/Dashboard';
import Users from './pages/Users/Users';
import AddUser from './pages/Users/AddUser';
import EditUser from './pages/Users/EditUser';
import UserDetail from './pages/Users/UserDetail';
import Companies from './pages/Company/Companies';
import AddCompany from './pages/Company/AddCompany';
import EditCompany from './pages/Company/EditCompany';
import CompanyAddresses from './pages/CompanyAddress/CompanyAddresses';
import AddCompanyAddress from './pages/CompanyAddress/AddCompanyAddress';
import EditCompanyAddress from './pages/CompanyAddress/EditCompanyAddress';
import ShayonaChallanList from './pages/DeliveryChallan/Shayona/ShayonaChallanList';
import AddShayonaChallan from './pages/DeliveryChallan/Shayona/AddShayonaChallan';
import EditShayonaChallan from './pages/DeliveryChallan/Shayona/EditShayonaChallan';
import ViewShayonaChallan from './pages/DeliveryChallan/Shayona/ViewShayonaChallan';
import McnoreChallanList from './pages/DeliveryChallan/Mcnore/McnoreChallanList';
import AddMcnoreChallan from './pages/DeliveryChallan/Mcnore/AddMcnoreChallan';
import EditMcnoreChallan from './pages/DeliveryChallan/Mcnore/EditMcnoreChallan';
import ViewMcnoreChallan from './pages/DeliveryChallan/Mcnore/ViewMcnoreChallan';
import ShernoChallanList from './pages/DeliveryChallan/Sherno/ShernoChallanList';
import AddShernoChallan from './pages/DeliveryChallan/Sherno/AddShernoChallan';
import EditShernoChallan from './pages/DeliveryChallan/Sherno/EditShernoChallan';
import ViewShernoChallan from './pages/DeliveryChallan/Sherno/ViewShernoChallan';
import Brands from './pages/Brands/Brands';
import AddBrand from './pages/Brands/AddBrand';
import EditBrand from './pages/Brands/EditBrand';
import Operators from './pages/Operator/Operators';
import AddOperator from './pages/Operator/AddOperator';
import EditOperator from './pages/Operator/EditOperator';
import Shifts from './pages/Shift/Shifts';
import AddShift from './pages/Shift/AddShift';
import EditShift from './pages/Shift/EditShift';
import Units from './pages/units/Units';
import AddUnit from './pages/units/AddUnit';
import EditUnit from './pages/units/EditUnit';
import BottleSpecs from './pages/BottleSpec/BottleSpecs';
import AddBottleSpec from './pages/BottleSpec/AddBottleSpec';
import EditBottleSpec from './pages/BottleSpec/EditBottleSpec';
import BottleSpecDetail from './pages/BottleSpec/BottleSpecDetail';
import Variants from './pages/variant/Variants';
import AddVariant from './pages/variant/AddVariant';
import EditVariant from './pages/variant/EditVariant';
import VariantDetail from './pages/variant/VariantDetail';
import Formulas from './pages/Formula/Formulas';
import AddFormula from './pages/Formula/AddFormula';
import EditFormula from './pages/Formula/EditFormula';
import ViewFormula from './pages/Formula/ViewFormula';

import SgLabels from './pages/SgLabel/SgLabels';
import AddSgLabel from './pages/SgLabel/AddSgLabel';
import EditSgLabel from './pages/SgLabel/EditSgLabel';
import SgLabelTwoList from './pages/SgLabelTwo/SgLabelTwoList';
import AddSgLabelTwo from './pages/SgLabelTwo/AddSgLabelTwo';
import EditSgLabelTwo from './pages/SgLabelTwo/EditSgLabelTwo';
import ViewSgLabelTwo from './pages/SgLabelTwo/ViewSgLabelTwo';
import RawMaterials from './pages/RawMaterial/RawMaterials';
import AddRawMaterial from './pages/RawMaterial/AddRawMaterial';
import EditRawMaterial from './pages/RawMaterial/EditRawMaterial';
import ViewRawMaterial from './pages/RawMaterial/ViewRawMaterial';
import StockSummary from './pages/StockEntry/StockSummary';
import StockInvoices from './pages/StockEntry/StockInvoices';
import MaterialHistory from './pages/StockEntry/MaterialHistory';
import AddStockIn from './pages/StockEntry/AddStockIn';
import ViewStockIn from './pages/StockEntry/ViewStockIn';
import EditStockIn from './pages/StockEntry/EditStockIn';
import IncomingCompanies from './pages/Incoming/IncomingCompanies';
import IncomingList from './pages/Incoming/IncomingList';
import AddIncoming from './pages/Incoming/AddIncoming';
import EditIncoming from './pages/Incoming/EditIncoming';
import ViewIncoming from './pages/Incoming/ViewIncoming';
import ShrenoIncomingList from './pages/ShrenoIncoming/ShrenoIncomingList';
import AddShrenoIncoming from './pages/ShrenoIncoming/AddShrenoIncoming';
import EditShrenoIncoming from './pages/ShrenoIncoming/EditShrenoIncoming';
import ViewShrenoIncoming from './pages/ShrenoIncoming/ViewShrenoIncoming';
import ItemTypes from './pages/ItemType/ItemTypes';
import AddItemType from './pages/ItemType/AddItemType';
import EditItemType from './pages/ItemType/EditItemType';
import GstList from './pages/Gst/GstList';
import AddGst from './pages/Gst/AddGst';
import EditGst from './pages/Gst/EditGst';
import BottlePerBoxes from './pages/BottlePerBox/BottlePerBoxes';
import AddBottlePerBox from './pages/BottlePerBox/AddBottlePerBox';
import EditBottlePerBox from './pages/BottlePerBox/EditBottlePerBox';
import Productions from './pages/Production/Productions';
import Production from './pages/Production/Production';
import AddProduction from './pages/Production/AddProduction';
import EditProduction from './pages/Production/EditProduction';
import ProductionDetail from './pages/Production/ProductionDetail';
import CoatingProductions from './pages/CoatingProduction/CoatingProductions';
import AddCoatingProduction from './pages/CoatingProduction/AddCoatingProduction';
import EditCoatingProduction from './pages/CoatingProduction/EditCoatingProduction';
import ViewCoatingProduction from './pages/CoatingProduction/ViewCoatingProduction';
import CoatingSpecs from './pages/CoatingSpec/CoatingSpecs';
import AddCoatingSpec from './pages/CoatingSpec/AddCoatingSpec';
import EditCoatingSpec from './pages/CoatingSpec/EditCoatingSpec';
import ViewCoatingSpec from './pages/CoatingSpec/ViewCoatingSpec';
import Settings from './pages/system/Settings';
import ChangePassword from './pages/system/ChangePassword';
import Placeholder from './pages/system/Placeholder';
import PrintingTypes from './pages/PrintingTypes/PrintingTypes';
import AddPrintingType from './pages/PrintingTypes/AddPrintingType';
import EditPrintingType from './pages/PrintingTypes/EditPrintingType';
import PrintingColors from './pages/PrintingColor/PrintingColors';
import AddPrintingColor from './pages/PrintingColor/AddPrintingColor';
import EditPrintingColor from './pages/PrintingColor/EditPrintingColor';
import CoatingTypes from './pages/CoatingType/CoatingTypes';
import AddCoatingType from './pages/CoatingType/AddCoatingType';
import EditCoatingType from './pages/CoatingType/EditCoatingType';
import Login from './pages/system/Login';
import RoleList from './pages/Roles&Permission/RoleList';
import CreateRole from './pages/Roles&Permission/CreateRole';
import PermissionList from './pages/Roles&Permission/PermissionList';
import CreatePermission from './pages/Roles&Permission/CreatePermission';
import LacquerPlan from './pages/LacquerPlan/LacquerPlan';
import AddLacquerPlan from './pages/LacquerPlan/AddLacquerPlan';
import EditLacquerPlan from './pages/LacquerPlan/EditLacquerPlan';
import ViewLacquerPlan from './pages/LacquerPlan/ViewLacquerPlan';
import PrintingPlanCompanies from './pages/PrintingPlan/PrintingPlanCompanies';
import PrintingPlan from './pages/PrintingPlan/PrintingPlan';
import AddPrintingPlan from './pages/PrintingPlan/AddPrintingPlan';
import EditPrintingPlan from './pages/PrintingPlan/EditPrintingPlan';
import ViewPrintingPlan from './pages/PrintingPlan/ViewPrintingPlan';
import PendingSheet from './pages/PendingSheet/PendingSheet';
import AddPendingSheet from './pages/PendingSheet/AddPendingSheet';
import EditPendingSheet from './pages/PendingSheet/EditPendingSheet';
import ViewPendingSheet from './pages/PendingSheet/ViewPendingSheet';
import DispatchList from './pages/Dispatch/DispatchList';
import AddDispatch from './pages/Dispatch/AddDispatch';
import EditDispatch from './pages/Dispatch/EditDispatch';
import ViewDispatch from './pages/Dispatch/ViewDispatch';
import './App.css';

export default function App() {
  const [collapsed, setCollapsed] = useState(false);
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);

  const ability = defineAbilitiesFor(user);

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <AbilityContext.Provider value={ability}>
      <div className="admin-layout">
        <Sidebar collapsed={collapsed} onClose={() => setCollapsed(false)} />
        <div className={`main-content ${collapsed ? 'expanded' : ''}`}>
          <Topbar
            collapsed={collapsed}
            onToggle={() => setCollapsed(!collapsed)}
            onLogout={() => dispatch(logoutUser())}
          />
          <div className="page-wrapper p-4">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/users" element={<Users />} />
              <Route path="/users/add" element={<AddUser />} />
              <Route path="/users/edit/:id" element={<EditUser />} />
              <Route path="/users/view/:id" element={<UserDetail />} />
              <Route path="/companies" element={<Companies />} />
              <Route path="/companies/add" element={<AddCompany />} />
              <Route path="/companies/edit/:id" element={<EditCompany />} />
              <Route path="/company-addresses" element={<CompanyAddresses />} />
              <Route path="/company-addresses/add" element={<AddCompanyAddress />} />
              <Route path="/company-addresses/edit/:id" element={<EditCompanyAddress />} />
              <Route path="/brands" element={<Brands />} />
              <Route path="/brands/add" element={<AddBrand />} />
              <Route path="/brands/edit/:id" element={<EditBrand />} />
              <Route path="/operators" element={<Operators />} />
              <Route path="/operators/add" element={<AddOperator />} />
              <Route path="/operators/edit/:id" element={<EditOperator />} />
              <Route path="/shifts" element={<Shifts />} />
              <Route path="/shifts/add" element={<AddShift />} />
              <Route path="/shifts/edit/:id" element={<EditShift />} />
              <Route path="/units" element={<Units />} />
              <Route path="/units/add" element={<AddUnit />} />
              <Route path="/units/edit/:id" element={<EditUnit />} />
              <Route path="/bottle-specs" element={<BottleSpecs />} />
              <Route path="/bottle-specs/add" element={<AddBottleSpec />} />
              <Route path="/bottle-specs/edit/:id" element={<EditBottleSpec />} />
              <Route path="/bottle-specs/view/:id" element={<BottleSpecDetail />} />
              <Route path="/variants" element={<Variants />} />
              <Route path="/variants/add" element={<AddVariant />} />
              <Route path="/variants/edit/:id" element={<EditVariant />} />
              <Route path="/variants/view/:id" element={<VariantDetail />} />
              <Route path="/formulas" element={<Formulas />} />
              <Route path="/formulas/add" element={<AddFormula />} />
              <Route path="/formulas/edit/:id" element={<EditFormula />} />
              <Route path="/formulas/view/:id" element={<ViewFormula />} />
              <Route path="/sg-labels" element={<SgLabels />} />
              <Route path="/sg-labels/add" element={<AddSgLabel />} />
              <Route path="/sg-labels/edit/:id" element={<EditSgLabel />} />
              <Route path="/sg-labels-2" element={<SgLabelTwoList />} />
              <Route path="/sg-labels-2/add" element={<AddSgLabelTwo />} />
              <Route path="/sg-labels-2/edit/:id" element={<EditSgLabelTwo />} />
              <Route path="/sg-labels-2/view/:id" element={<ViewSgLabelTwo />} />
              <Route path="/raw-materials" element={<RawMaterials />} />
              <Route path="/raw-materials/add" element={<AddRawMaterial />} />
              <Route path="/raw-materials/edit/:id" element={<EditRawMaterial />} />
              <Route path="/raw-materials/view/:id" element={<ViewRawMaterial />} />
              <Route path="/stock-summary" element={<StockSummary />} />
              <Route path="/stock-invoices" element={<StockInvoices />} />
              <Route path="/stock-history" element={<MaterialHistory />} />
              <Route path="/stock-entries/add" element={<AddStockIn />} />
              <Route path="/stock-entries/view/:id" element={<ViewStockIn />} />
              <Route path="/stock-entries/edit/:id" element={<EditStockIn />} />
              
              <Route path="/incoming" element={<IncomingCompanies />} />
              <Route path="/incoming/company/:companyId" element={<IncomingList />} />
              <Route path="/incoming/add" element={<AddIncoming />} />
              <Route path="/incoming/edit/:id" element={<EditIncoming />} />
              <Route path="/incoming/view/:id" element={<ViewIncoming />} />

              <Route path="/shreno-incoming" element={<ShrenoIncomingList />} />
              <Route path="/shreno-incoming/add" element={<AddShrenoIncoming />} />
              <Route path="/shreno-incoming/edit/:id" element={<EditShrenoIncoming />} />
              <Route path="/shreno-incoming/view/:id" element={<ViewShrenoIncoming />} />

              <Route path="/item-types" element={<ItemTypes />} />
              <Route path="/item-types/add" element={<AddItemType />} />
              <Route path="/item-types/edit/:id" element={<EditItemType />} />
              
              <Route path="/lacquer-plan" element={<LacquerPlan />} />
              <Route path="/lacquer-plan/add" element={<AddLacquerPlan />} />
              <Route path="/lacquer-plan/edit/:id" element={<EditLacquerPlan />} />
              <Route path="/lacquer-plan/view/:id" element={<ViewLacquerPlan />} />

              <Route path="/printing-plan" element={<PrintingPlan />} />
              <Route path="/printing-plan/add" element={<AddPrintingPlan />} />
              <Route path="/printing-plan/edit/:id" element={<EditPrintingPlan />} />
              <Route path="/printing-plan/view/:id" element={<ViewPrintingPlan />} />
              
              <Route path="/pending-sheet" element={<PendingSheet />} />
              <Route path="/pending-sheet/add" element={<AddPendingSheet />} />
              <Route path="/pending-sheet/edit/:id" element={<EditPendingSheet />} />
              <Route path="/pending-sheet/view/:id" element={<ViewPendingSheet />} />
              
              <Route path="/dispatch" element={<DispatchList />} />
              <Route path="/dispatch/add" element={<AddDispatch />} />
              <Route path="/dispatch/edit/:id" element={<EditDispatch />} />
              <Route path="/dispatch/view/:id" element={<ViewDispatch />} />

              <Route path="/delivery-challan/shayoona" element={<ShayonaChallanList />} />
              <Route path="/delivery-challan/shayoona/add" element={<AddShayonaChallan />} />
              <Route path="/delivery-challan/shayoona/edit/:id" element={<EditShayonaChallan />} />
              <Route path="/delivery-challan/shayoona/view/:id" element={<ViewShayonaChallan />} />

              <Route path="/delivery-challan/mcnore" element={<McnoreChallanList />} />
              <Route path="/delivery-challan/mcnore/add" element={<AddMcnoreChallan />} />
              <Route path="/delivery-challan/mcnore/edit/:id" element={<EditMcnoreChallan />} />
              <Route path="/delivery-challan/mcnore/view/:id" element={<ViewMcnoreChallan />} />

              <Route path="/delivery-challan/sherno" element={<ShernoChallanList />} />
              <Route path="/delivery-challan/sherno/add" element={<AddShernoChallan />} />
              <Route path="/delivery-challan/sherno/edit/:id" element={<EditShernoChallan />} />
              <Route path="/delivery-challan/sherno/view/:id" element={<ViewShernoChallan />} />

              <Route path="/gst" element={<GstList />} />
              <Route path="/gst/add" element={<AddGst />} />
              <Route path="/gst/edit/:id" element={<EditGst />} />
              
              <Route path="/bottle-per-box" element={<BottlePerBoxes />} />
              <Route path="/bottle-per-box/add" element={<AddBottlePerBox />} />
              <Route path="/bottle-per-box/edit/:id" element={<EditBottlePerBox />} />
              
              <Route path="/productions" element={<Productions />} />
              <Route path="/production" element={<Production />} />
              <Route path="/productions/add" element={<AddProduction />} />
              <Route path="/productions/edit/:id" element={<EditProduction />} />
              <Route path="/productions/view/:id" element={<ProductionDetail />} />
              <Route path="/coating-productions/unit/:unit" element={<CoatingProductions />} />
              <Route path="/coating-productions/add/unit/:unit" element={<AddCoatingProduction />} />
              <Route path="/coating-productions/edit/:id" element={<EditCoatingProduction />} />
              <Route path="/coating-productions/view/:id" element={<ViewCoatingProduction />} />
              <Route path="/coating-specs" element={<CoatingSpecs />} />
              <Route path="/coating-specs/add" element={<AddCoatingSpec />} />
              <Route path="/coating-specs/edit/:id" element={<EditCoatingSpec />} />
              <Route path="/coating-specs/view/:id" element={<ViewCoatingSpec />} />
              <Route path="/printing-types" element={<PrintingTypes />} />
              <Route path="/printing-types/add" element={<AddPrintingType />} />
              <Route path="/printing-types/edit/:id" element={<EditPrintingType />} />
              <Route path="/printing-colors" element={<PrintingColors />} />
              <Route path="/printing-colors/add" element={<AddPrintingColor />} />
              <Route path="/printing-colors/edit/:id" element={<EditPrintingColor />} />
              <Route path="/coating-types" element={<CoatingTypes />} />
              <Route path="/coating-types/add" element={<AddCoatingType />} />
              <Route path="/coating-types/edit/:id" element={<EditCoatingType />} />
              <Route path="/roles" element={<RoleList />} />
              <Route path="/roles/create" element={<CreateRole />} />
              <Route path="/roles/edit/:id" element={<CreateRole />} />
              <Route path="/permissions" element={<PermissionList />} />
              <Route path="/permissions/create" element={<CreatePermission />} />
              <Route path="/permissions/edit/:id" element={<CreatePermission />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/change-password" element={<ChangePassword />} />
              <Route path="/analytics" element={<Placeholder title="Analytics" icon="bi-bar-chart-line-fill" desc="Deep-dive analytics" />} />
              <Route path="/reports" element={<Placeholder title="Reports" icon="bi-file-earmark-bar-graph-fill" desc="Generate and export reports" />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </div>
      </div>
    </AbilityContext.Provider>
  );
}
