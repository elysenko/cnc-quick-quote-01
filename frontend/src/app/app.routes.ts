import { Routes } from '@angular/router';
import { adminGuard, authGuard } from './core/guards';

/**
 * Central route manifest. Every navigable state is URL-addressable and
 * deep-linkable: wizard steps and admin tabs are child routes, modals are
 * `?modal=<name>`, edit panes are `?edit=<id>`, list state is `?page=` /
 * `?status=` / `?sort=`, the selected bend is `?bend=<id>` and the work-bed
 * animation is `?anim=running|stopped`.
 */
export const routes: Routes = [
  {
    path: 'login',
    data: { flow: 'auth-login' },
    loadComponent: () => import('./pages/auth/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'signup',
    data: { flow: 'auth-signup' },
    loadComponent: () => import('./pages/auth/signup.component').then((m) => m.SignupComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./shell/app-shell.component').then((m) => m.AppShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'quotes' },

      {
        path: 'quote/new',
        data: { flow: 'quote-wizard' },
        loadComponent: () => import('./pages/quote/quote-wizard.component').then((m) => m.QuoteWizardComponent),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'upload' },
          {
            path: 'upload',
            data: { flow: 'quote-upload' },
            loadComponent: () => import('./pages/quote/upload-step.component').then((m) => m.UploadStepComponent),
          },
          {
            path: 'bends',
            data: { flow: 'quote-bends' },
            loadComponent: () => import('./pages/quote/bend-step.component').then((m) => m.BendStepComponent),
          },
          {
            path: 'configure',
            data: { flow: 'quote-configure' },
            loadComponent: () => import('./pages/quote/configure-step.component').then((m) => m.ConfigureStepComponent),
          },
          {
            path: 'result',
            data: { flow: 'quote-result' },
            loadComponent: () => import('./pages/quote/result-step.component').then((m) => m.ResultStepComponent),
          },
        ],
      },

      {
        path: 'quotes',
        data: { flow: 'quotes-list' },
        loadComponent: () => import('./pages/quote/quotes-list.component').then((m) => m.QuotesListComponent),
      },
      {
        path: 'quotes/:quoteId',
        data: { flow: 'quote-detail' },
        loadComponent: () => import('./pages/quote/quote-detail.component').then((m) => m.QuoteDetailComponent),
      },

      {
        path: 'checkout/:quoteId/review',
        data: { flow: 'checkout-review' },
        loadComponent: () => import('./pages/checkout/checkout-review.component').then((m) => m.CheckoutReviewComponent),
      },
      {
        path: 'checkout/:quoteId/shipping',
        data: { flow: 'checkout-shipping' },
        loadComponent: () => import('./pages/checkout/checkout-shipping.component').then((m) => m.CheckoutShippingComponent),
      },
      {
        path: 'checkout/:quoteId/payment',
        data: { flow: 'checkout-payment' },
        loadComponent: () => import('./pages/checkout/checkout-payment.component').then((m) => m.CheckoutPaymentComponent),
      },

      {
        path: 'orders/confirmation',
        data: { flow: 'order-confirmation' },
        loadComponent: () => import('./pages/orders/order-confirmation.component').then((m) => m.OrderConfirmationComponent),
      },
      {
        path: 'orders',
        data: { flow: 'orders-list' },
        loadComponent: () => import('./pages/orders/orders-list.component').then((m) => m.OrdersListComponent),
      },
      {
        path: 'account',
        data: { flow: 'account' },
        loadComponent: () => import('./pages/account/account.component').then((m) => m.AccountComponent),
      },

      {
        path: 'admin',
        canActivate: [adminGuard],
        data: { flow: 'admin' },
        loadComponent: () => import('./pages/admin/admin-shell.component').then((m) => m.AdminShellComponent),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'materials' },
          {
            path: 'materials',
            data: { flow: 'admin-materials' },
            loadComponent: () => import('./pages/admin/materials.component').then((m) => m.MaterialsComponent),
          },
          {
            path: 'pricing',
            data: { flow: 'admin-pricing' },
            loadComponent: () => import('./pages/admin/pricing.component').then((m) => m.PricingComponent),
          },
          {
            path: 'machine',
            data: { flow: 'admin-machine' },
            loadComponent: () => import('./pages/admin/machine.component').then((m) => m.MachineComponent),
          },
          {
            path: 'uploads',
            data: { flow: 'admin-uploads' },
            loadComponent: () => import('./pages/admin/uploads.component').then((m) => m.UploadsComponent),
          },
          {
            path: 'business',
            data: { flow: 'admin-business' },
            loadComponent: () => import('./pages/admin/business-layout.component').then((m) => m.BusinessLayoutComponent),
            children: [
              { path: '', pathMatch: 'full', redirectTo: 'branding' },
              {
                path: 'branding',
                data: { flow: 'admin-business-branding' },
                loadComponent: () => import('./pages/admin/branding-tab.component').then((m) => m.BrandingTabComponent),
              },
              {
                path: 'contact',
                data: { flow: 'admin-business-contact' },
                loadComponent: () => import('./pages/admin/contact-tab.component').then((m) => m.ContactTabComponent),
              },
              {
                path: 'payment',
                data: { flow: 'admin-business-payment' },
                loadComponent: () => import('./pages/admin/payment-tab.component').then((m) => m.PaymentTabComponent),
              },
              {
                path: 'shipping',
                data: { flow: 'admin-business-shipping' },
                loadComponent: () => import('./pages/admin/shipping-tab.component').then((m) => m.ShippingTabComponent),
              },
            ],
          },
          {
            path: 'orders',
            data: { flow: 'admin-orders' },
            loadComponent: () => import('./pages/admin/admin-orders.component').then((m) => m.AdminOrdersComponent),
          },
          {
            path: 'orders/:orderId',
            data: { flow: 'admin-order-detail' },
            loadComponent: () => import('./pages/admin/admin-order-detail.component').then((m) => m.AdminOrderDetailComponent),
          },
          {
            path: 'settings',
            data: { flow: 'admin-settings' },
            loadComponent: () => import('./pages/admin/admin-settings.component').then((m) => m.AdminSettingsComponent),
          },
        ],
      },
    ],
  },

  { path: '**', redirectTo: '' },
];
